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

// ===== Zod Validation Schemas =====

export const SystemConfigSchema = z.object({
  // Identity
  bbs_name: z.string().min(1).max(100).optional(),
  sysop_name: z.string().min(1).max(100).optional(),
  location: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  website: z.string().url().max(200).optional().or(z.literal('')),

  // Security & Authentication
  min_password_length: z.number().int().min(0).max(32).optional(),
  min_password_strength: z.number().int().min(0).max(4).optional(),
  max_password_fails: z.number().int().min(-1).optional(),
  password_security: z.enum(['bcrypt', 'sha256', 'md5']).optional(),
  strict_password_policy: z.boolean().optional(),
  auto_validate: z.boolean().optional(),
  confirm_deletions: z.boolean().optional(),

  // Session Settings
  default_time_limit: z.number().int().min(1).max(1440).optional(),
  max_session_time: z.number().int().min(1).max(1440).optional(),
  idle_timeout: z.number().int().min(1).max(60).optional(),

  // Display Settings
  ansi_enabled: z.boolean().optional(),
  color_scheme: z.string().max(50).optional(),
  allow_custom_screens: z.boolean().optional(),

  // Language
  language_base: z.string().max(200).optional(),
  default_language: z.string().max(50).optional(),

  // Limits
  max_conferences: z.number().int().min(1).max(256).optional(),
  max_message_bases: z.number().int().min(1).max(1024).optional(),
  max_file_areas: z.number().int().min(1).max(1024).optional(),
  max_nodes: z.number().int().min(1).max(8).optional(),

  // File Management
  file_check_enabled: z.boolean().optional(),
  upload_check_virus: z.boolean().optional(),
  upload_check_dupe: z.boolean().optional(),

  // Mail
  allow_internet_email: z.boolean().optional(),
  smtp_server: z.string().max(200).optional(),
  smtp_port: z.number().int().min(1).max(65535).optional(),

  // SMTP Extended (TOOLTYPE_BBSCONFIG from reference-boardBBS)
  smtp_username: z.string().max(200).optional(),
  smtp_password: z.string().max(500).optional(),
  smtp_ssl: z.boolean().optional(),
  smtp_from_email: z.string().email().max(200).optional().or(z.literal('')),
  sysop_email: z.string().email().max(200).optional().or(z.literal('')),
  bbs_email: z.string().email().max(200).optional().or(z.literal('')),

  // FTP Server (TOOLTYPE_BBSCONFIG, express.e:15485-15489)
  ftp_enabled: z.boolean().optional(),
  ftp_host: z.string().max(200).optional(),
  ftp_port: z.number().int().min(1).max(65535).optional(),
  ftp_data_ports: z.string().max(500).optional(),

  // HTTP Server (TOOLTYPE_XFERLIB, express.e:15002-15006)
  http_enabled: z.boolean().optional(),
  http_host: z.string().max(200).optional(),
  http_port: z.number().int().min(1).max(65535).optional(),

  // BBS Server Ports
  telnet_port: z.number().int().min(1).max(65535).optional(),
  ssh_port: z.number().int().min(1).max(65535).optional(),

  // System Behavior (TOOLTYPE_BBSCONFIG)
  quiet_join: z.boolean().optional(),
  convert_to_mb: z.boolean().optional(),
  reg_key: z.string().max(200).optional(),

  // Logging
  debug_mode: z.boolean().optional(),
  log_level: z.enum(['debug', 'info', 'warning', 'error']).optional(),
  log_retention_days: z.number().int().min(1).max(365).optional()
});

export const NodeConfigSchema = z.object({
  node_number: z.number().int().min(1).max(8),
  node_start: z.string().max(200).optional(),
  priority: z.number().int().min(-1).max(20).optional(),
  capitol_files: z.boolean().optional(),
  def_screens: z.boolean().optional(),
  no_mci_msg: z.boolean().optional(),
  sysop_chat_color: z.number().int().min(30).max(37).optional(),
  user_chat_color: z.number().int().min(30).max(37).optional(),
  break_chat: z.boolean().optional(),
  sentby_files: z.boolean().optional(),
  keep_upload_credit: z.boolean().optional(),
  free_resuming: z.boolean().optional(),
  callers_log: z.boolean().optional(),
  start_log: z.boolean().optional(),
  door_log: z.boolean().optional(),
  ud_log: z.boolean().optional(),
  log_host: z.boolean().optional(),
  telnet: z.boolean().optional(),
  ftp: z.boolean().optional(),
  disable_quick_logons: z.boolean().optional(),
  view_password: z.boolean().optional(),
  no_rad_boogie: z.boolean().optional(),
  nrams: z.array(z.string()).optional()
});

export const ConferenceConfigSchema = z.object({
  conference_id: z.number().int().min(1),
  ndirs: z.number().int().min(0).max(16).optional(),
  dlpath_1: z.string().max(200).optional(),
  dlpath_2: z.string().max(200).optional(),
  dlpath_3: z.string().max(200).optional(),
  dlpath_4: z.string().max(200).optional(),
  dlpath_5: z.string().max(200).optional(),
  dlpath_6: z.string().max(200).optional(),
  dlpath_7: z.string().max(200).optional(),
  dlpath_8: z.string().max(200).optional(),
  dlpath_9: z.string().max(200).optional(),
  dlpath_10: z.string().max(200).optional(),
  dlpath_11: z.string().max(200).optional(),
  dlpath_12: z.string().max(200).optional(),
  dlpath_13: z.string().max(200).optional(),
  dlpath_14: z.string().max(200).optional(),
  dlpath_15: z.string().max(200).optional(),
  dlpath_16: z.string().max(200).optional(),
  ulpath_1: z.string().max(200).optional(),
  ulpath_2: z.string().max(200).optional(),
  ulpath_3: z.string().max(200).optional(),
  ulpath_4: z.string().max(200).optional(),
  ulpath_5: z.string().max(200).optional(),
  ulpath_6: z.string().max(200).optional(),
  ulpath_7: z.string().max(200).optional(),
  ulpath_8: z.string().max(200).optional(),
  ulpath_9: z.string().max(200).optional(),
  ulpath_10: z.string().max(200).optional(),
  ulpath_11: z.string().max(200).optional(),
  ulpath_12: z.string().max(200).optional(),
  ulpath_13: z.string().max(200).optional(),
  ulpath_14: z.string().max(200).optional(),
  ulpath_15: z.string().max(200).optional(),
  ulpath_16: z.string().max(200).optional(),
  force_newscan: z.boolean().optional(),
  no_newscan: z.boolean().optional(),
  show_new_files: z.boolean().optional(),
  no_new_files: z.boolean().optional(),
  free_downloads: z.boolean().optional(),
  exclude_ftp: z.boolean().optional(),
  private_conf: z.boolean().optional(),
  read_only: z.boolean().optional(),
  menu_prompt: z.string().max(200).optional(),
  confdb_shared: z.number().int().min(0).optional(),
  use_username: z.boolean().optional(),
  use_realname: z.boolean().optional(),
  use_internetname: z.boolean().optional(),
  min_access_level: z.number().int().min(1).max(255).optional(),
  max_access_level: z.number().int().min(1).max(255).optional()
});

export const DoorSchema = z.object({
  door_name: z.string().min(1).max(100),
  door_command: z.string().min(1).max(50),
  door_type: z.enum(['SYSCMD', 'BBSCMD', 'INTERNAL']),
  door_path: z.string().min(1).max(500),
  door_args: z.string().max(500).optional(),
  working_directory: z.string().max(500).optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']).optional(),
  door_options: z.array(z.string()).optional(),
  runtime_env: z.enum(['AMIGA_68K', 'NATIVE_NODE', 'BROWSER']).optional(),
  min_security_level: z.number().int().min(1).max(255).optional(),
  max_security_level: z.number().int().min(1).max(255).optional(),
  required_flags: z.string().max(100).optional(),
  time_limit: z.number().int().min(0).optional(),
  memory_limit: z.number().int().min(0).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  enabled: z.boolean().optional()
});

export const SystemLanguagesSchema = z.object({
  host_language: z.string().min(1).max(50).optional(),
  language_base_path: z.string().max(200).optional(),
  allow_user_selection: z.boolean().optional()
});

export const LanguageSchema = z.object({
  language_number: z.number().int().min(1).max(10),
  title: z.string().min(1).max(100),
  language_code: z.string().min(2).max(10),
  file_path: z.string().max(200).optional(),
  enabled: z.boolean().optional()
});

export const ProtocolSchema = z.object({
  protocol_name: z.string().min(1).max(100),
  protocol_code: z.string().min(1).max(20),
  command: z.string().min(1).max(500),
  upload_command: z.string().max(500).optional(),
  download_command: z.string().max(500).optional(),
  batch_upload: z.boolean().optional(),
  batch_download: z.boolean().optional(),
  bidirectional: z.boolean().optional(),
  enabled: z.boolean().optional(),
  is_default: z.boolean().optional()
});

// Security Level Access (TOOLTYPE_ACCESS from express.e)
export const SecurityLevelAccessSchema = z.object({
  security_level: z.number().int().min(1).max(255),
  acs_flag: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional()
});

// Drive Configuration (TOOLTYPE_DRIVES from express.e:17412-17418)
export const DriveConfigSchema = z.object({
  drive_number: z.number().int().min(1),
  drive_path: z.string().min(1).max(500),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional()
});

// Computer Types (TOOLTYPE_COMPUTERLIST from express.e:31954-31965)
export const ComputerTypeSchema = z.object({
  computer_number: z.number().int().min(1),
  computer_name: z.string().min(1).max(100),
  enabled: z.boolean().optional()
});

// Screen Types (TOOLTYPE_SCREENTYPES from express.e:31905-31915)
export const ScreenTypeSchema = z.object({
  screen_number: z.number().int().min(1),
  screen_type: z.string().min(1).max(50),
  screen_title: z.string().min(1).max(100),
  enabled: z.boolean().optional()
});

// File Checkers (TOOLTYPE_FCHECK from express.e:18556-18614)
export const FileCheckerSchema = z.object({
  checker_name: z.string().min(1).max(200),
  checker_path: z.string().min(1).max(500),
  options: z.string().max(1000).optional(),
  stack_size: z.number().int().min(1024).max(1048576).optional(), // 1KB to 1MB
  priority: z.number().int().min(-20).max(20).optional(),
  script_path: z.string().max(500).optional(),
  enabled: z.boolean().optional()
});

// File Checker Error Patterns (express.e:18614-18621)
export const FileCheckerErrorSchema = z.object({
  file_checker_id: z.number().int().min(1),
  error_number: z.number().int().min(1),
  error_pattern: z.string().min(1).max(500)
});

// ===== Request Context =====

export interface RequestContext {
  userId?: string;
  username: string;
  ipAddress?: string;
  userAgent?: string;
}

// ===== Configuration Service =====

export class ConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  // ===== System Configuration =====

  async getSystemConfig(): Promise<SystemConfig> {
    let config = this.configRepo.getSystemConfig();

    // Create default if doesn't exist
    if (!config) {
      config = this.configRepo.createSystemConfig({});
    }

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

    // Update
    const newConfig = this.configRepo.updateSystemConfig(validated);

    // Log change
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
    return this.configRepo.getNodeConfigs();
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
    return this.configRepo.getConferenceConfigs();
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

    // Get old values
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) {
      throw new Error(`Conference config ${conferenceId} not found`);
    }

    // Update
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
    return this.configRepo.getLanguages();
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

    // Check for duplicate code
    const existing = await this.getLanguageByCode(validated.language_code);
    if (existing) {
      throw new Error(`Language code '${validated.language_code}' already exists`);
    }

    // Create
    const newLanguage = this.configRepo.createLanguage(validated);

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

    // Get old values
    const oldLanguage = await this.getLanguage(id);
    if (!oldLanguage) {
      throw new Error(`Language ${id} not found`);
    }

    // Check for duplicate code if changing
    if (validated.language_code && validated.language_code !== oldLanguage.language_code) {
      const existing = await this.getLanguageByCode(validated.language_code);
      if (existing) {
        throw new Error(`Language code '${validated.language_code}' already exists`);
      }
    }

    // Update
    const newLanguage = this.configRepo.updateLanguage(id, validated);

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
    return this.configRepo.getProtocols();
  }

  async getProtocol(id: number): Promise<Protocol | null> {
    return this.configRepo.getProtocol(id);
  }

  async getProtocolByCode(code: string): Promise<Protocol | null> {
    return this.configRepo.getProtocolByCode(code);
  }

  async createProtocol(
    protocol: Omit<Protocol, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Protocol> {
    // Validate input
    const validated = ProtocolSchema.parse(protocol) as Omit<Protocol, 'id' | 'created_at' | 'updated_at'>;

    // Check for duplicate code
    const existing = await this.getProtocolByCode(validated.protocol_code);
    if (existing) {
      throw new Error(`Protocol code '${validated.protocol_code}' already exists`);
    }

    // Create
    const newProtocol = this.configRepo.createProtocol(validated);

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

    // Get old values
    const oldProtocol = await this.getProtocol(id);
    if (!oldProtocol) {
      throw new Error(`Protocol ${id} not found`);
    }

    // Check for duplicate code if changing
    if (validated.protocol_code && validated.protocol_code !== oldProtocol.protocol_code) {
      const existing = await this.getProtocolByCode(validated.protocol_code);
      if (existing) {
        throw new Error(`Protocol code '${validated.protocol_code}' already exists`);
      }
    }

    // Update
    const newProtocol = this.configRepo.updateProtocol(id, validated);

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
    const allAccess = await this.configRepo.getAllSecurityAccessForLevel(0); // Get all
    const oldAccess = allAccess.find(a => a.id === id);
    if (!oldAccess) {
      throw new Error(`Security access ${id} not found`);
    }

    // Update
    const success = this.configRepo.updateSecurityAccess(id, validated);

    if (success) {
      const newAccess = allAccess.find(a => a.id === id);
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
    return this.configRepo.getAllDrives();
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
    return this.configRepo.getAllComputerTypes();
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
    return this.configRepo.getAllScreenTypes();
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
    return this.configRepo.getAllFileCheckers();
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
