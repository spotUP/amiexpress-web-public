/**
 * Configuration Service
 * Business logic layer for BBS configuration management
 *
 * Features:
 * - Zod validation for all inputs
 * - Automatic audit logging
 * - Error handling
 * - Transaction support
 */

import { z } from 'zod';
import type { Database } from '../database';
import type { ConfigRepository } from '../database/config-repository';
import { ConferenceSetupService } from './conference-setup.service';
import { loadConfConfig } from './conf-config.service';
import { InfoFileParser } from './info-file-parser';
import type {
  SystemConfig,
  NodeConfig,
  ConferenceConfig,
  Door,
  SystemLanguages,
  Language,
  Protocol,
  SecurityLevelAccess,
  DriveConfig,
  ComputerType,
  ScreenType,
  FileChecker,
  FileCheckerError
} from '../database/types';
import { loadBBSConfig, saveBBSConfig, type BBSConfigData } from './bbs-config-file.service';
import { config as appConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

// Import Zod validation schemas from dedicated module
export {
  SystemConfigSchema,
  NodeConfigSchema,
  ConferenceConfigSchema,
  DoorSchema,
  SystemLanguagesSchema,
  LanguageSchema,
  ProtocolSchema,
  SecurityLevelAccessSchema,
  DriveConfigSchema,
  ComputerTypeSchema,
  ScreenTypeSchema,
  FileCheckerSchema,
  FileCheckerErrorSchema
} from './config.schemas';

export type { RequestContext } from './config.schemas';

// ===== Configuration Service =====

export class ConfigService {
  private configRepo: ConfigRepository;
  private conferenceSetup: ConferenceSetupService;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
    const bbsRoot = appConfig.get('dataDir');
    this.conferenceSetup = new ConferenceSetupService(bbsRoot);
  }

  // ===== System Configuration =====

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

  // ===== Node Configuration =====

  async getNodeConfigs(): Promise<NodeConfig[]> {
    // DISK-BASED: Load from Node{N}.info files
    const bbsRoot = appConfig.get('dataDir');
    const nodeConfigs: NodeConfig[] = [];

    try {
      // Check Node0.info through Node7.info (8 nodes)
      for (let nodeNum = 0; nodeNum <= 7; nodeNum++) {
        const nodeInfoPath = path.join(bbsRoot, `Node${nodeNum}.info`);

        if (!fs.existsSync(nodeInfoPath)) {
          continue; // Skip missing nodes
        }

        const buffer = fs.readFileSync(nodeInfoPath);
        const stats = fs.statSync(nodeInfoPath);
        const parser = new InfoFileParser();
        const parsed = parser.parse(buffer);

        // Convert tooltypes to uppercase map
        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          toolTypes.set(key.toUpperCase(), value);
        }

        // Build NodeConfig from tooltypes
        nodeConfigs.push({
          id: nodeNum + 1,
          node_number: nodeNum,
          node_start: toolTypes.get('NODESTART') || 'BBS:Express',
          priority: parseInt(toolTypes.get('PRIORITY') || '0', 10),
          capitol_files: toolTypes.has('CAPITOL_FILES'),
          def_screens: toolTypes.has('DEF_SCREENS'),
          no_mci_msg: false,
          sysop_chat_color: parseInt(toolTypes.get('SYSOP_CHAT_COLOR') || '33', 10),
          user_chat_color: parseInt(toolTypes.get('USER_CHAT_COLOR') || '32', 10),
          break_chat: false,
          sentby_files: toolTypes.has('SENTBY_FILES'),
          keep_upload_credit: false,
          free_resuming: false,
          callers_log: toolTypes.has('CALLERS_LOG'),
          start_log: toolTypes.has('START_LOG'),
          door_log: false,
          ud_log: toolTypes.has('UD_LOG'),
          log_host: false,
          telnet: !toolTypes.has('NO_TELNET'),
          ftp: toolTypes.has('FTP'),
          disable_quick_logons: toolTypes.has('DISABLE_QUICK_LOGONS'),
          view_password: toolTypes.has('VIEW_PASSWORD'),
          no_rad_boogie: false,
          nrams: [],
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

      console.log(`[ConfigService] Loaded ${nodeConfigs.length} node configs from disk files`);
      return nodeConfigs;
    } catch (error) {
      console.error('[ConfigService] Error reading Node{N}.info files:', error);
      return this.configRepo.getNodeConfigs();
    }
  }

  async getNodeConfig(nodeNumber: number): Promise<NodeConfig | null> {
    if (nodeNumber < 1 || nodeNumber > 8) {
      throw new Error('Node number must be between 1 and 8');
    }

    return this.configRepo.getNodeConfig(nodeNumber);
  }

  async createNodeConfig(
    config: Omit<NodeConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<NodeConfig> {
    // Validate input
    const validated = NodeConfigSchema.parse(config) as Omit<NodeConfig, 'id' | 'created_at' | 'updated_at'>;

    // Create
    const newConfig = this.configRepo.createNodeConfig(validated);

    // Log change
    this.configRepo.logConfigChange(
      'node_config',
      newConfig.id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newConfig,
      context.ipAddress,
      context.userAgent
    );

    return newConfig;
  }

  async updateNodeConfig(
    nodeNumber: number,
    updates: Partial<NodeConfig>,
    context: RequestContext
  ): Promise<NodeConfig> {
    if (nodeNumber < 1 || nodeNumber > 8) {
      throw new Error('Node number must be between 1 and 8');
    }

    // Validate input
    const validated = NodeConfigSchema.partial().parse(updates);

    // Get old values
    const oldConfig = await this.getNodeConfig(nodeNumber);
    if (!oldConfig) {
      throw new Error(`Node config ${nodeNumber} not found`);
    }

    // Update
    const newConfig = this.configRepo.updateNodeConfig(nodeNumber, validated);

    // Log change
    this.configRepo.logConfigChange(
      'node_config',
      newConfig.id,
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

  async deleteNodeConfig(nodeNumber: number, context: RequestContext): Promise<boolean> {
    if (nodeNumber < 1 || nodeNumber > 8) {
      throw new Error('Node number must be between 1 and 8');
    }

    // Get old values
    const oldConfig = await this.getNodeConfig(nodeNumber);
    if (!oldConfig) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteNodeConfig(nodeNumber);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'node_config',
        oldConfig.id,
        'DELETE',
        context.userId,
        context.username,
        oldConfig,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Conference Configuration =====

  async getConferenceConfig(conferenceId: number): Promise<ConferenceConfig | null> {
    return this.configRepo.getConferenceConfig(conferenceId);
  }

  async getConferenceConfigs(): Promise<ConferenceConfig[]> {
    // DISK-BASED: Load from ConfConfig.info and Conf{N}.info
    const bbsRoot = appConfig.get('dataDir');
    const confConfig = loadConfConfig(bbsRoot);

    if (!confConfig || confConfig.confCount === 0) {
      console.warn('[ConfigService] ConfConfig.info not found or empty, falling back to database');
      return this.configRepo.getConferenceConfigs();
    }

    const configs: ConferenceConfig[] = [];
    const parser = new InfoFileParser();

    for (let i = 1; i <= confConfig.confCount; i++) {
      const confInfoPath = path.join(bbsRoot, `Conf${i}.info`);

      if (!fs.existsSync(confInfoPath)) {
        console.warn(`[ConfigService] Conf${i}.info not found, skipping`);
        continue;
      }

      try {
        const buffer = fs.readFileSync(confInfoPath);
        const stats = fs.statSync(confInfoPath);
        const parsed = parser.parse(buffer);

        // Convert tooltypes to uppercase map for case-insensitive access
        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          toolTypes.set(key.toUpperCase(), value);
        }

        // Parse conference configuration from tooltypes
        const ndirs = parseInt(toolTypes.get('NDIRS') || '0', 10);

        // Build ConferenceConfig with individual dlpath_N and ulpath_N fields
        const config: ConferenceConfig = {
          id: i,
          conference_id: i,
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
        console.error(`[ConfigService] Error reading Conf${i}.info:`, error);
      }
    }

    console.log(`[ConfigService] Loaded ${configs.length} conferences from disk files`);
    return configs;
  }

  async createConferenceConfig(
    config: Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    // Validate input
    const validated = ConferenceConfigSchema.parse(config) as Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>;

    // Create
    const newConfig = this.configRepo.createConferenceConfig(validated);

    // Log change
    this.configRepo.logConfigChange(
      'conference_config',
      newConfig.id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newConfig,
      context.ipAddress,
      context.userAgent
    );

    return newConfig;
  }

  async updateConferenceConfig(
    conferenceId: number,
    updates: Partial<ConferenceConfig>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    // Validate input
    const validated = ConferenceConfigSchema.partial().parse(updates);

    // Get old values for audit
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) {
      throw new Error(`Conference config ${conferenceId} not found`);
    }

    // DISK-BASED: Write to Conf{N}.info (technical settings only)
    // Note: Conference name/location are stored in ConfConfig.info, not here
    const confInfoUpdates: any = {};
    if (validated.ndirs !== undefined) confInfoUpdates.ndirs = validated.ndirs;
    if (validated.min_access_level !== undefined) confInfoUpdates.minAccessLevel = validated.min_access_level;
    if (validated.max_access_level !== undefined) confInfoUpdates.maxAccessLevel = validated.max_access_level;
    if (validated.force_newscan !== undefined) confInfoUpdates.forceNewscan = validated.force_newscan;
    if (validated.exclude_ftp !== undefined) confInfoUpdates.excludeFTP = validated.exclude_ftp;
    if (validated.private_conf !== undefined) confInfoUpdates.privateConf = validated.private_conf;
    if (validated.read_only !== undefined) confInfoUpdates.readOnly = validated.read_only;

    // Handle file area paths
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

    // Also update database for backwards compatibility / audit trail
    const newConfig = this.configRepo.updateConferenceConfig(conferenceId, validated);

    // Log change
    this.configRepo.logConfigChange(
      'conference_config',
      newConfig.id,
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

  async deleteConferenceConfig(conferenceId: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteConferenceConfig(conferenceId);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'conference_config',
        oldConfig.id,
        'DELETE',
        context.userId,
        context.username,
        oldConfig,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Doors =====

  async getDoors(): Promise<Door[]> {
    return this.configRepo.getDoors();
  }

  async getDoor(id: number): Promise<Door | null> {
    return this.configRepo.getDoor(id);
  }

  async getDoorByCommand(command: string): Promise<Door | null> {
    return this.configRepo.getDoorByCommand(command);
  }

  async createDoor(
    door: Omit<Door, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Door> {
    // Validate input
    const validated = DoorSchema.parse(door) as Omit<Door, 'id' | 'created_at' | 'updated_at'>;

    // Check for duplicate command
    const existing = await this.getDoorByCommand(validated.door_command);
    if (existing) {
      throw new Error(`Door command '${validated.door_command}' already exists`);
    }

    // Create
    const newDoor = this.configRepo.createDoor(validated);

    // Log change
    this.configRepo.logConfigChange(
      'doors',
      newDoor.id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newDoor,
      context.ipAddress,
      context.userAgent
    );

    return newDoor;
  }

  async updateDoor(
    id: number,
    updates: Partial<Door>,
    context: RequestContext
  ): Promise<Door> {
    // Validate input
    const validated = DoorSchema.partial().parse(updates);

    // Get old values
    const oldDoor = await this.getDoor(id);
    if (!oldDoor) {
      throw new Error(`Door ${id} not found`);
    }

    // Check for duplicate command if changing
    if (validated.door_command && validated.door_command !== oldDoor.door_command) {
      const existing = await this.getDoorByCommand(validated.door_command);
      if (existing) {
        throw new Error(`Door command '${validated.door_command}' already exists`);
      }
    }

    // Update
    const newDoor = this.configRepo.updateDoor(id, validated);

    // Log change
    this.configRepo.logConfigChange(
      'doors',
      newDoor.id,
      'UPDATE',
      context.userId,
      context.username,
      oldDoor,
      newDoor,
      context.ipAddress,
      context.userAgent
    );

    return newDoor;
  }

  async deleteDoor(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldDoor = await this.getDoor(id);
    if (!oldDoor) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteDoor(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'doors',
        oldDoor.id,
        'DELETE',
        context.userId,
        context.username,
        oldDoor,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== System Languages =====

  async getSystemLanguages(): Promise<SystemLanguages> {
    let config = this.configRepo.getSystemLanguages();

    // Create default if doesn't exist
    if (!config) {
      config = this.configRepo.createSystemLanguages({});
    }

    return config;
  }

  async updateSystemLanguages(
    updates: Partial<SystemLanguages>,
    context: RequestContext
  ): Promise<SystemLanguages> {
    // Validate input
    const validated = SystemLanguagesSchema.parse(updates);

    // Get old values
    const oldConfig = await this.getSystemLanguages();

    // Update
    const newConfig = this.configRepo.updateSystemLanguages(validated);

    // Log change
    this.configRepo.logConfigChange(
      'system_languages',
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

  // ===== Languages =====

  async getLanguages(): Promise<Language[]> {
    // DISK-BASED: Load from Languages/*.info files
    const bbsRoot = appConfig.get('dataDir');
    const languagesDir = path.join(bbsRoot, 'Languages');

    if (!fs.existsSync(languagesDir)) {
      console.warn('[ConfigService] Languages/ directory not found, falling back to database');
      return this.configRepo.getLanguages();
    }

    try {
      const languages: Language[] = [];
      const files = fs.readdirSync(languagesDir);
      const infoFiles = files.filter(f => f.endsWith('.info'));

      let languageNum = 1;
      for (const infoFile of infoFiles) {
        const infoPath = path.join(languagesDir, infoFile);
        const buffer = fs.readFileSync(infoPath);
        const stats = fs.statSync(infoPath);
        const parser = new InfoFileParser();
        const parsed = parser.parse(buffer);

        // Convert tooltypes to uppercase map
        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          toolTypes.set(key.toUpperCase(), value);
        }

        // Language name from filename (remove .info extension)
        const languageName = infoFile.replace(/\.info$/i, '');

        languages.push({
          id: languageNum++,
          language_number: languageNum - 1,
          title: languageName,
          language_code: languageName.substring(0, 2).toLowerCase(),
          file_path: infoPath,
          enabled: true,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

      console.log(`[ConfigService] Loaded ${languages.length} languages from disk files`);
      return languages;
    } catch (error) {
      console.error('[ConfigService] Error reading Languages/ directory:', error);
      return this.configRepo.getLanguages();
    }
  }

  async getLanguage(id: number): Promise<Language | null> {
    return this.configRepo.getLanguage(id);
  }

  async getLanguageByCode(code: string): Promise<Language | null> {
    return this.configRepo.getLanguageByCode(code);
  }

  async createLanguage(
    language: Omit<Language, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Language> {
    // Validate input
    const validated = LanguageSchema.parse(language) as Omit<Language, 'id' | 'created_at' | 'updated_at'>;

    // Check for duplicate code against all languages (disk-based)
    const allLanguages = await this.getLanguages();
    const existing = allLanguages.find(l =>
      l.language_code.toUpperCase() === validated.language_code.toUpperCase()
    );
    if (existing) {
      throw new Error(`Language code '${validated.language_code}' already exists`);
    }

    // Create
    const newLanguage = this.configRepo.createLanguage(validated);

    if (!newLanguage) {
      throw new Error('Failed to create language');
    }

    // Log change
    this.configRepo.logConfigChange(
      'languages',
      newLanguage.id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newLanguage,
      context.ipAddress,
      context.userAgent
    );

    return newLanguage;
  }

  async updateLanguage(
    id: number,
    updates: Partial<Language>,
    context: RequestContext
  ): Promise<Language> {
    // Validate input
    const validated = LanguageSchema.partial().parse(updates);

    // Get old values (may be from disk, not database)
    const oldLanguage = await this.getLanguage(id);
    if (!oldLanguage) {
      throw new Error(`Language ${id} not found`);
    }

    // Check for duplicate code if changing
    if (validated.language_code && validated.language_code !== oldLanguage.language_code) {
      // Check against all languages (disk-based), not just database
      const allLanguages = await this.getLanguages();
      const existing = allLanguages.find(l =>
        l.language_code.toUpperCase() === validated.language_code!.toUpperCase() && l.id !== id
      );
      if (existing) {
        throw new Error(`Language code '${validated.language_code}' already exists`);
      }
    }

    // Try to update in database
    const dbLanguage = this.configRepo.updateLanguage(id, validated);

    // If database didn't have this item (disk-based), merge updates with old values
    const newLanguage: Language = dbLanguage || {
      ...oldLanguage,
      ...validated,
      updated_at: new Date()
    };

    // Log change
    this.configRepo.logConfigChange(
      'languages',
      newLanguage.id,
      'UPDATE',
      context.userId,
      context.username,
      oldLanguage,
      newLanguage,
      context.ipAddress,
      context.userAgent
    );

    return newLanguage;
  }

  async deleteLanguage(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldLanguage = await this.getLanguage(id);
    if (!oldLanguage) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteLanguage(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'languages',
        oldLanguage.id,
        'DELETE',
        context.userId,
        context.username,
        oldLanguage,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Protocols =====

  async getProtocols(): Promise<Protocol[]> {
    // DISK-BASED: Load from Protocols/XprTypes.info
    const bbsRoot = appConfig.get('dataDir');
    const xprTypesPath = path.join(bbsRoot, 'Protocols', 'XprTypes.info');

    if (!fs.existsSync(xprTypesPath)) {
      console.warn('[ConfigService] Protocols/XprTypes.info not found, falling back to database');
      return this.configRepo.getProtocols();
    }

    try {
      const buffer = fs.readFileSync(xprTypesPath);
      const stats = fs.statSync(xprTypesPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      // Convert tooltypes to uppercase map
      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      // Parse protocols from LIBRARY.N and TITLE.N tooltypes
      const protocols: Protocol[] = [];
      let protocolNum = 1;

      while (true) {
        const library = toolTypes.get(`LIBRARY.${protocolNum}`);
        const title = toolTypes.get(`TITLE.${protocolNum}`);

        if (!library && !title) break; // No more protocols

        if (library && title) {
          protocols.push({
            id: protocolNum,
            protocol_name: title,
            protocol_code: library,
            command: library,
            upload_command: '',
            download_command: '',
            batch_upload: library.toLowerCase().includes('zmodem') || library.toLowerCase().includes('ymodem'),
            batch_download: library.toLowerCase().includes('zmodem') || library.toLowerCase().includes('ymodem'),
            bidirectional: library.toLowerCase().includes('hydra'),
            enabled: true,
            is_default: protocolNum === 1,
            created_at: stats.birthtime,
            updated_at: stats.mtime
          });
        }

        protocolNum++;
        if (protocolNum > 50) break; // Safety limit
      }

      console.log(`[ConfigService] Loaded ${protocols.length} protocols from disk files`);
      return protocols;
    } catch (error) {
      console.error('[ConfigService] Error reading Protocols/XprTypes.info:', error);
      return this.configRepo.getProtocols();
    }
  }

  async getProtocol(id: number): Promise<Protocol | null> {
    // DISK-BASED: Load all protocols from disk and find by ID
    const protocols = await this.getProtocols();
    return protocols.find(p => p.id === id) || null;
  }

  async getProtocolByCode(code: string): Promise<Protocol | null> {
    // DISK-BASED: Load all protocols from disk and find by code
    const protocols = await this.getProtocols();
    return protocols.find(p => p.protocol_code.toUpperCase() === code.toUpperCase()) || null;
  }

  async createProtocol(
    protocol: Omit<Protocol, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Protocol> {
    // Validate input
    const validated = ProtocolSchema.parse(protocol) as Omit<Protocol, 'id' | 'created_at' | 'updated_at'>;

    // Check for duplicate code against all protocols (disk-based)
    const existing = await this.getProtocolByCode(validated.protocol_code);
    if (existing) {
      throw new Error(`Protocol code '${validated.protocol_code}' already exists`);
    }

    // Create
    const newProtocol = this.configRepo.createProtocol(validated);

    if (!newProtocol) {
      throw new Error('Failed to create protocol');
    }

    // Log change
    this.configRepo.logConfigChange(
      'protocols',
      newProtocol.id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newProtocol,
      context.ipAddress,
      context.userAgent
    );

    return newProtocol;
  }

  async updateProtocol(
    id: number,
    updates: Partial<Protocol>,
    context: RequestContext
  ): Promise<Protocol> {
    // Validate input
    const validated = ProtocolSchema.partial().parse(updates);

    // Get old values (may be from disk, not database)
    const oldProtocol = await this.getProtocol(id);
    if (!oldProtocol) {
      throw new Error(`Protocol ${id} not found`);
    }

    // Check for duplicate code if changing
    if (validated.protocol_code && validated.protocol_code !== oldProtocol.protocol_code) {
      // Check against all protocols (disk-based), not just database
      const allProtocols = await this.getProtocols();
      const existing = allProtocols.find(p =>
        p.protocol_code.toUpperCase() === validated.protocol_code!.toUpperCase() && p.id !== id
      );
      if (existing) {
        throw new Error(`Protocol code '${validated.protocol_code}' already exists`);
      }
    }

    // Try to update in database
    const dbProtocol = this.configRepo.updateProtocol(id, validated);

    // If database didn't have this item (disk-based), merge updates with old values
    const newProtocol: Protocol = dbProtocol || {
      ...oldProtocol,
      ...validated,
      updated_at: new Date()
    };

    // Log change
    this.configRepo.logConfigChange(
      'protocols',
      newProtocol.id,
      'UPDATE',
      context.userId,
      context.username,
      oldProtocol,
      newProtocol,
      context.ipAddress,
      context.userAgent
    );

    return newProtocol;
  }

  async deleteProtocol(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldProtocol = await this.getProtocol(id);
    if (!oldProtocol) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteProtocol(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'protocols',
        oldProtocol.id,
        'DELETE',
        context.userId,
        context.username,
        oldProtocol,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Security Level Access (TOOLTYPE_ACCESS) =====

  async getSecurityAccessForLevel(securityLevel: number): Promise<SecurityLevelAccess[]> {
    if (securityLevel < 1 || securityLevel > 255) {
      throw new Error('Security level must be between 1 and 255');
    }
    return this.configRepo.getAllSecurityAccessForLevel(securityLevel);
  }

  async getSecurityAccessByFlag(
    securityLevel: number,
    acsFlag: string
  ): Promise<SecurityLevelAccess | null> {
    if (securityLevel < 1 || securityLevel > 255) {
      throw new Error('Security level must be between 1 and 255');
    }
    return this.configRepo.getSecurityAccessByFlag(securityLevel, acsFlag);
  }

  async createSecurityAccess(
    data: Omit<SecurityLevelAccess, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<SecurityLevelAccess> {
    // Validate input
    const validated = SecurityLevelAccessSchema.parse(data);

    // Create
    const id = this.configRepo.createSecurityAccess({
      security_level: validated.security_level,
      acs_flag: validated.acs_flag,
      enabled: validated.enabled ?? true,
      description: validated.description
    });

    const newAccess = this.configRepo.getSecurityAccessByFlag(validated.security_level, validated.acs_flag);
    if (!newAccess) {
      throw new Error('Failed to create security access');
    }

    // Log change
    this.configRepo.logConfigChange(
      'security_level_access',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newAccess,
      context.ipAddress,
      context.userAgent
    );

    return newAccess;
  }

  async updateSecurityAccess(
    id: number,
    updates: Partial<SecurityLevelAccess>,
    context: RequestContext
  ): Promise<boolean> {
    // Validate input
    const validated = SecurityLevelAccessSchema.partial().parse(updates);

    // Get old values
    // Pull from the specific level first; fall back to all
    const level = updates.security_level ?? undefined;
    const scopedAccess = level !== undefined
      ? await this.configRepo.getAllSecurityAccessForLevel(level)
      : await this.configRepo.getAllSecurityAccessForLevel(0);
    const oldAccess = scopedAccess.find((a: any) => a.id === id);
    if (!oldAccess) {
      throw new Error(`Security access ${id} not found`);
    }

    // Update
    const success = this.configRepo.updateSecurityAccess(id, validated);

    if (success) {
      const refreshed = level !== undefined
        ? await this.configRepo.getAllSecurityAccessForLevel(level)
        : await this.configRepo.getAllSecurityAccessForLevel(0);
      const newAccess = refreshed.find((a: any) => a.id === id);
      // Log change
      this.configRepo.logConfigChange(
        'security_level_access',
        id,
        'UPDATE',
        context.userId,
        context.username,
        oldAccess,
        newAccess,
        context.ipAddress,
        context.userAgent
      );
    }

    return success;
  }

  async deleteSecurityAccess(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const allAccess = await this.configRepo.getAllSecurityAccessForLevel(0);
    const oldAccess = allAccess.find(a => a.id === id);
    if (!oldAccess) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteSecurityAccess(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'security_level_access',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldAccess,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Drive Configuration (TOOLTYPE_DRIVES) =====

  async getAllDrives(): Promise<DriveConfig[]> {
    // DISK-BASED: Load from Drives.info
    const bbsRoot = appConfig.get('dataDir');
    const drivesInfoPath = path.join(bbsRoot, 'Drives.info');

    if (!fs.existsSync(drivesInfoPath)) {
      console.warn('[ConfigService] Drives.info not found, falling back to database');
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

      console.log(`[ConfigService] Loaded ${drives.length} drives from disk files`);
      return drives;
    } catch (error) {
      console.error('[ConfigService] Error reading Drives.info:', error);
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

    // Create
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

    // Update
    const success = this.configRepo.updateDrive(id, validated);
    if (!success) {
      throw new Error(`Failed to update drive ${id}`);
    }

    const newDrive = await this.getDrive(id);
    if (!newDrive) {
      throw new Error('Failed to retrieve updated drive');
    }

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

    // Delete
    const deleted = this.configRepo.deleteDrive(id);

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

  // ===== Computer Types (TOOLTYPE_COMPUTERLIST) =====

  async getAllComputerTypes(): Promise<ComputerType[]> {
    // DISK-BASED: Load from ComputerList.info
    const bbsRoot = appConfig.get('dataDir');
    const computerListPath = path.join(bbsRoot, 'ComputerList.info');

    if (!fs.existsSync(computerListPath)) {
      console.warn('[ConfigService] ComputerList.info not found, falling back to database');
      return this.configRepo.getAllComputerTypes();
    }

    try {
      const buffer = fs.readFileSync(computerListPath);
      const stats = fs.statSync(computerListPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      // Convert tooltypes to uppercase map
      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      // Parse COMPUTER.NUM and COMPUTER.N tooltypes
      const computers: ComputerType[] = [];
      const computerCount = parseInt(toolTypes.get('COMPUTER.NUM') || '0', 10);

      for (let i = 1; i <= computerCount; i++) {
        const computerName = toolTypes.get(`COMPUTER.${i}`);
        if (computerName) {
          computers.push({
            id: i,
            computer_number: i,
            computer_name: computerName,
            enabled: true,
            created_at: stats.birthtime,
            updated_at: stats.mtime
          });
        }
      }

      console.log(`[ConfigService] Loaded ${computers.length} computer types from disk files`);
      return computers;
    } catch (error) {
      console.error('[ConfigService] Error reading ComputerList.info:', error);
      return this.configRepo.getAllComputerTypes();
    }
  }

  async getComputerType(id: number): Promise<ComputerType | null> {
    return this.configRepo.getComputerTypeById(id);
  }

  async createComputerType(
    computerType: Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ComputerType> {
    // Validate input
    const validated = ComputerTypeSchema.parse(computerType);

    // Create
    const id = this.configRepo.createComputerType({
      computer_number: validated.computer_number,
      computer_name: validated.computer_name,
      enabled: validated.enabled ?? true
    });

    const newType = await this.getComputerType(id);
    if (!newType) {
      throw new Error('Failed to create computer type');
    }

    // Log change
    this.configRepo.logConfigChange(
      'computer_types',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newType,
      context.ipAddress,
      context.userAgent
    );

    return newType;
  }

  async updateComputerType(
    id: number,
    updates: Partial<ComputerType>,
    context: RequestContext
  ): Promise<ComputerType> {
    // Validate input
    const validated = ComputerTypeSchema.partial().parse(updates);

    // Get old values
    const oldType = await this.getComputerType(id);
    if (!oldType) {
      throw new Error(`Computer type ${id} not found`);
    }

    // Update
    const success = this.configRepo.updateComputerType(id, validated);
    if (!success) {
      throw new Error(`Failed to update computer type ${id}`);
    }

    const newType = await this.getComputerType(id);
    if (!newType) {
      throw new Error('Failed to retrieve updated computer type');
    }

    // Log change
    this.configRepo.logConfigChange(
      'computer_types',
      id,
      'UPDATE',
      context.userId,
      context.username,
      oldType,
      newType,
      context.ipAddress,
      context.userAgent
    );

    return newType;
  }

  async deleteComputerType(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldType = await this.getComputerType(id);
    if (!oldType) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteComputerType(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'computer_types',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldType,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Screen Types (TOOLTYPE_SCREENTYPES) =====

  async getAllScreenTypes(): Promise<ScreenType[]> {
    // DISK-BASED: Load from ScreenTypes.info
    const bbsRoot = appConfig.get('dataDir');
    const screenTypesPath = path.join(bbsRoot, 'ScreenTypes.info');

    if (!fs.existsSync(screenTypesPath)) {
      console.warn('[ConfigService] ScreenTypes.info not found, falling back to database');
      return this.configRepo.getAllScreenTypes();
    }

    try {
      const buffer = fs.readFileSync(screenTypesPath);
      const stats = fs.statSync(screenTypesPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      // Convert tooltypes to uppercase map
      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      // Parse TYPE.N and TITLE.N tooltypes
      const screenTypes: ScreenType[] = [];
      let typeNum = 1;

      while (true) {
        const type = toolTypes.get(`TYPE.${typeNum}`);
        const title = toolTypes.get(`TITLE.${typeNum}`);

        if (!type && !title) break;

        if (type && title) {
          screenTypes.push({
            id: typeNum,
            screen_number: typeNum,
            screen_type: type,
            screen_title: title,
            enabled: true,
            created_at: stats.birthtime,
            updated_at: stats.mtime
          });
        }

        typeNum++;
        if (typeNum > 50) break; // Safety limit
      }

      console.log(`[ConfigService] Loaded ${screenTypes.length} screen types from disk files`);
      return screenTypes;
    } catch (error) {
      console.error('[ConfigService] Error reading ScreenTypes.info:', error);
      return this.configRepo.getAllScreenTypes();
    }
  }

  async getScreenType(id: number): Promise<ScreenType | null> {
    return this.configRepo.getScreenTypeById(id);
  }

  async createScreenType(
    screenType: Omit<ScreenType, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ScreenType> {
    // Validate input
    const validated = ScreenTypeSchema.parse(screenType);

    // Create
    const id = this.configRepo.createScreenType({
      screen_number: validated.screen_number,
      screen_type: validated.screen_type,
      screen_title: validated.screen_title,
      enabled: validated.enabled ?? true
    });

    const newType = await this.getScreenType(id);
    if (!newType) {
      throw new Error('Failed to create screen type');
    }

    // Log change
    this.configRepo.logConfigChange(
      'screen_types',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newType,
      context.ipAddress,
      context.userAgent
    );

    return newType;
  }

  async updateScreenType(
    id: number,
    updates: Partial<ScreenType>,
    context: RequestContext
  ): Promise<ScreenType> {
    // Validate input
    const validated = ScreenTypeSchema.partial().parse(updates);

    // Get old values
    const oldType = await this.getScreenType(id);
    if (!oldType) {
      throw new Error(`Screen type ${id} not found`);
    }

    // Update
    const success = this.configRepo.updateScreenType(id, validated);
    if (!success) {
      throw new Error(`Failed to update screen type ${id}`);
    }

    const newType = await this.getScreenType(id);
    if (!newType) {
      throw new Error('Failed to retrieve updated screen type');
    }

    // Log change
    this.configRepo.logConfigChange(
      'screen_types',
      id,
      'UPDATE',
      context.userId,
      context.username,
      oldType,
      newType,
      context.ipAddress,
      context.userAgent
    );

    return newType;
  }

  async deleteScreenType(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldType = await this.getScreenType(id);
    if (!oldType) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteScreenType(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'screen_types',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldType,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== File Checkers (TOOLTYPE_FCHECK) =====

  async getAllFileCheckers(): Promise<FileChecker[]> {
    // DISK-BASED: Load from Fcheck/*.info files (express.e:18556-18614)
    const bbsRoot = appConfig.get('dataDir');
    const fcheckDir = path.join(bbsRoot, 'Fcheck');

    if (!fs.existsSync(fcheckDir)) {
      console.warn('[ConfigService] Fcheck/ directory not found, falling back to database');
      return this.configRepo.getAllFileCheckers();
    }

    try {
      const fileCheckers: FileChecker[] = [];
      const files = fs.readdirSync(fcheckDir);
      const infoFiles = files.filter(f => f.endsWith('.info'));

      let checkerId = 1;
      for (const infoFile of infoFiles) {
        const infoPath = path.join(fcheckDir, infoFile);
        const buffer = fs.readFileSync(infoPath);
        const stats = fs.statSync(infoPath);
        const parser = new InfoFileParser();
        const parsed = parser.parse(buffer);

        // Convert tooltypes to uppercase map
        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          // Handle keys that start with & (continuation line indicator)
          const cleanKey = key.startsWith('&') ? key.substring(1).toUpperCase() : key.toUpperCase();
          toolTypes.set(cleanKey, value);
        }

        // Get checker path (express.e:18556-18560)
        let checkerPath = toolTypes.get('CHECKER') || '';

        // Skip if no checker path defined
        if (!checkerPath) {
          continue;
        }

        // Extract file extension name (e.g., "LHA" from "LHA.info")
        const checkerName = path.basename(infoFile, '.info');

        // Get options (express.e:18562-18565)
        const options = toolTypes.get('OPTIONS') || toolTypes.get('SOPTIONS') || '';

        // Get stack size (express.e:18567-18571)
        const stackStr = toolTypes.get('STACK');
        let stackSize = 4096; // Default from express.e
        if (stackStr && stackStr !== 'SAME') {
          const parsedStack = parseInt(stackStr, 10);
          if (!isNaN(parsedStack)) {
            stackSize = parsedStack;
          }
        }

        // Get priority (express.e:18573-18577)
        const priorityStr = toolTypes.get('PRIORITY');
        let priority = 0; // Default
        if (priorityStr) {
          const parsedPriority = parseInt(priorityStr, 10);
          if (!isNaN(parsedPriority)) {
            priority = parsedPriority;
          }
        }

        // Get script path (express.e:18595)
        const scriptPath = toolTypes.get('SCRIPT') || '';

        fileCheckers.push({
          id: checkerId++,
          checker_name: checkerName,
          checker_path: checkerPath,
          options: options,
          stack_size: stackSize,
          priority: priority,
          script_path: scriptPath,
          enabled: true,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

      console.log(`[ConfigService] Loaded ${fileCheckers.length} file checkers from Fcheck/ directory`);
      return fileCheckers;
    } catch (error) {
      console.error('[ConfigService] Error reading Fcheck/ directory:', error);
      return this.configRepo.getAllFileCheckers();
    }
  }

  async getFileChecker(id: number): Promise<FileChecker | null> {
    return this.configRepo.getFileCheckerById(id);
  }

  async createFileChecker(
    checker: Omit<FileChecker, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<FileChecker> {
    // Validate input
    const validated = FileCheckerSchema.parse(checker);

    // Build creation object with only defined fields
    const createData: any = {
      checker_name: validated.checker_name,
      checker_path: validated.checker_path,
      enabled: validated.enabled ?? true
    };

    if (validated.options !== undefined) createData.options = validated.options;
    if (validated.stack_size !== undefined) createData.stack_size = validated.stack_size;
    if (validated.priority !== undefined) createData.priority = validated.priority;
    if (validated.script_path !== undefined) createData.script_path = validated.script_path;

    // Create
    const id = this.configRepo.createFileChecker(createData);

    const newChecker = await this.getFileChecker(id);
    if (!newChecker) {
      throw new Error('Failed to create file checker');
    }

    // Log change
    this.configRepo.logConfigChange(
      'file_checkers',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newChecker,
      context.ipAddress,
      context.userAgent
    );

    return newChecker;
  }

  async updateFileChecker(
    id: number,
    updates: Partial<FileChecker>,
    context: RequestContext
  ): Promise<FileChecker> {
    // Validate input
    const validated = FileCheckerSchema.partial().parse(updates);

    // Get old values
    const oldChecker = await this.getFileChecker(id);
    if (!oldChecker) {
      throw new Error(`File checker ${id} not found`);
    }

    // Update
    const success = this.configRepo.updateFileChecker(id, validated);
    if (!success) {
      throw new Error(`Failed to update file checker ${id}`);
    }

    const newChecker = await this.getFileChecker(id);
    if (!newChecker) {
      throw new Error('Failed to retrieve updated file checker');
    }

    // Log change
    this.configRepo.logConfigChange(
      'file_checkers',
      id,
      'UPDATE',
      context.userId,
      context.username,
      oldChecker,
      newChecker,
      context.ipAddress,
      context.userAgent
    );

    return newChecker;
  }

  async deleteFileChecker(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldChecker = await this.getFileChecker(id);
    if (!oldChecker) {
      return false;
    }

    // Delete (will cascade delete all error patterns)
    const deleted = this.configRepo.deleteFileChecker(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'file_checkers',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldChecker,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  async getFileCheckerErrors(checkerId: number): Promise<FileCheckerError[]> {
    return this.configRepo.getFileCheckerErrors(checkerId);
  }

  async createFileCheckerError(
    error: Omit<FileCheckerError, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<FileCheckerError> {
    // Validate input
    const validated = FileCheckerErrorSchema.parse(error);

    // Verify parent checker exists
    const checker = await this.getFileChecker(validated.file_checker_id);
    if (!checker) {
      throw new Error(`File checker ${validated.file_checker_id} not found`);
    }

    // Create
    const id = this.configRepo.createFileCheckerError({
      file_checker_id: validated.file_checker_id,
      error_number: validated.error_number,
      error_pattern: validated.error_pattern
    });

    // Get created error
    const errors = await this.getFileCheckerErrors(validated.file_checker_id);
    const newError = errors.find(e => e.id === id);
    if (!newError) {
      throw new Error('Failed to create file checker error');
    }

    // Log change
    this.configRepo.logConfigChange(
      'file_checker_errors',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newError,
      context.ipAddress,
      context.userAgent
    );

    return newError;
  }

  async deleteFileCheckerError(id: number, context: RequestContext): Promise<boolean> {
    // Get all errors to find the one we're deleting
    const allCheckers = await this.getAllFileCheckers();
    let oldError: FileCheckerError | undefined;

    for (const checker of allCheckers) {
      const errors = await this.getFileCheckerErrors(checker.id);
      oldError = errors.find(e => e.id === id);
      if (oldError) break;
    }

    if (!oldError) {
      return false;
    }

    // Delete
    const deleted = this.configRepo.deleteFileCheckerError(id);

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'file_checker_errors',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldError,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  // ===== Audit Log =====

  async getAuditLog(
    tableName?: string,
    recordId?: number,
    limit: number = 100
  ) {
    return this.configRepo.getAuditLog(tableName, recordId, limit);
  }
}
