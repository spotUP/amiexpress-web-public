/**
 * Configuration Repository
 * CRUD operations for all configuration tables
 *
 * Handles:
 * - System configuration (singleton)
 * - Node configuration (1-255 nodes)
 * - Conference configuration
 * - Doors/commands
 * - Languages
 * - Protocols
 * - Audit logging
 */

import { BaseRepository } from './BaseRepository';
import type {
  SystemConfig,
  NodeConfig,
  ConferenceConfig,
  Door,
  SystemLanguages,
  Language,
  Protocol,
  ConfigAuditLog,
  SecurityLevelAccess,
  DriveConfig,
  ComputerType,
  ScreenType,
  FileChecker,
  FileCheckerError
} from './types';

export class ConfigRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  // ===== System Configuration (Singleton) =====

  /**
   * Get system configuration (always id = 1)
   */
  getSystemConfig(): SystemConfig | null {
    const stmt = this.prepare(`
      SELECT * FROM system_config WHERE id = 1
    `);

    const row = stmt.get() as any;
    if (!row) {
      return this.createSystemConfig({});
    }

    return this.mapSystemConfigRow(row);
  }

  /**
   * Create system configuration (singleton)
   */
  createSystemConfig(config: Partial<SystemConfig>): SystemConfig {
    const stmt = this.prepare(`
      INSERT INTO system_config (
        bbs_name, sysop_name, location, phone, email, website,
        min_password_length, min_password_strength, max_password_fails,
        password_security, strict_password_policy, auto_validate, confirm_deletions,
        default_time_limit, max_session_time, idle_timeout,
        new_user_sec_level, new_user_time_limit, new_user_chat_limit,
        new_user_lines_per_screen, new_user_expert, new_user_ansi,
        new_user_protocol, new_user_screen_type, new_user_editor, new_user_conf_access,
        new_user_available_chat, new_user_quiet_node, new_user_auto_rejoin,
        ansi_enabled, color_scheme, allow_custom_screens,
        language_base, default_language,
        max_conferences, max_message_bases, max_file_areas, max_nodes,
        file_check_enabled, upload_check_virus, upload_check_dupe,
        allow_internet_email, smtp_server, smtp_port, smtp_username, smtp_password,
        smtp_ssl, smtp_from_email, sysop_email, bbs_email,
        ftp_enabled, ftp_host, ftp_port, ftp_data_ports,
        http_enabled, http_host, http_port,
        telnet_port, ssh_port,
        quiet_join, convert_to_mb, reg_key,
        debug_mode, log_level, log_retention_days, sysop_debug_enabled,
        vapid_public_key, vapid_private_key, vapid_contact_email
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      config.bbs_name || 'AmiExpress BBS',
      config.sysop_name || 'Sysop',
      config.location || '',
      config.phone || '',
      config.email || '',
      config.website || '',
      config.min_password_length || 8,
      config.min_password_strength || 0,
      config.max_password_fails || -1,
      config.password_security || 'bcrypt',
      config.strict_password_policy ? 1 : 0,
      config.auto_validate ? 1 : 0,
      config.confirm_deletions !== false ? 1 : 0,
      config.default_time_limit ?? -1,
      config.max_session_time ?? -1,
      config.idle_timeout || 10,
      config.new_user_sec_level ?? 10,
      config.new_user_time_limit ?? 60,
      config.new_user_chat_limit ?? 30,
      config.new_user_lines_per_screen || 23,
      config.new_user_expert ? 1 : 0,
      config.new_user_ansi !== false ? 1 : 0,
      config.new_user_protocol || 'ZMODEM',
      config.new_user_screen_type || 'ANSI',
      config.new_user_editor || 'FULL',
      config.new_user_conf_access || 'XXX',
      config.new_user_available_chat !== false ? 1 : 0,
      config.new_user_quiet_node ? 1 : 0,
      config.new_user_auto_rejoin !== false ? 1 : 0,
      config.ansi_enabled !== false ? 1 : 0,
      config.color_scheme || 'standard',
      config.allow_custom_screens !== false ? 1 : 0,
      config.language_base || '',
      config.default_language || 'English',
      config.max_conferences || 32,
      config.max_message_bases || 256,
      config.max_file_areas || 256,
      config.max_nodes ?? 255,
      config.file_check_enabled !== false ? 1 : 0,
      config.upload_check_virus ? 1 : 0,
      config.upload_check_dupe !== false ? 1 : 0,
      config.allow_internet_email ? 1 : 0,
      config.smtp_server || '',
      config.smtp_port || 25,
      config.smtp_username || '',
      config.smtp_password || '',
      config.smtp_ssl ? 1 : 0,
      config.smtp_from_email || '',
      config.sysop_email || '',
      config.bbs_email || '',
      config.ftp_enabled ? 1 : 0,
      config.ftp_host || '',
      config.ftp_port || 21,
      config.ftp_data_ports || '',
      config.http_enabled ? 1 : 0,
      config.http_host || '',
      config.http_port || 80,
      config.telnet_port ?? 64128,
      config.ssh_port ?? 31337,
      config.quiet_join ? 1 : 0,
      config.convert_to_mb ? 1 : 0,
      config.reg_key || '',
      config.debug_mode ? 1 : 0,
      config.log_level || 'info',
      config.log_retention_days || 90,
      config.sysop_debug_enabled ? 1 : 0,
      config.vapid_public_key || '',
      config.vapid_private_key || '',
      config.vapid_contact_email || ''
    );
    const row = this.prepare(`
      SELECT * FROM system_config WHERE id = 1
    `).get() as any;
    return this.mapSystemConfigRow(row);
  }

  /**
   * Update system configuration
   */
  updateSystemConfig(updates: Partial<SystemConfig>): SystemConfig {
    const fields: string[] = [];
    const values: any[] = [];

    // Build UPDATE statement dynamically
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(
        typeof value === 'boolean' ? (value ? 1 : 0) :
        Array.isArray(value) ? JSON.stringify(value) :
        value
      );
    });

    if (fields.length === 0) {
      return this.getSystemConfig()!;
    }

    const stmt = this.prepare(`
      UPDATE system_config SET ${fields.join(', ')} WHERE id = 1
    `);

    stmt.run(...values);
    return this.getSystemConfig()!;
  }

  // ===== Node Configuration =====

  /**
   * Get all node configurations
   */
  getNodeConfigs(): NodeConfig[] {
    const stmt = this.prepare(`
      SELECT * FROM node_config ORDER BY node_number ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.mapNodeConfigRow(row));
  }

  /**
   * Get node configuration by node number
   */
  getNodeConfig(nodeNumber: number): NodeConfig | null {
    const stmt = this.prepare(`
      SELECT * FROM node_config WHERE node_number = ?
    `);

    const row = stmt.get(nodeNumber) as any;
    if (!row) return null;

    return this.mapNodeConfigRow(row);
  }

  /**
   * Create node configuration
   */
  createNodeConfig(config: Omit<NodeConfig, 'id' | 'created_at' | 'updated_at'>): NodeConfig {
    const stmt = this.prepare(`
      INSERT INTO node_config (
        node_number, node_start, priority,
        capitol_files, def_screens, no_mci_msg,
        sysop_chat_color, user_chat_color, break_chat,
        sentby_files, keep_upload_credit, free_resuming,
        callers_log, start_log, door_log, ud_log, log_host,
        telnet, ftp,
        disable_quick_logons, view_password,
        no_rad_boogie, nrams
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      config.node_number,
      config.node_start || 'BBS:EXPRESS',
      config.priority || -1,
      config.capitol_files ? 1 : 0,
      config.def_screens ? 1 : 0,
      config.no_mci_msg ? 1 : 0,
      config.sysop_chat_color || 33,
      config.user_chat_color || 32,
      config.break_chat ? 1 : 0,
      config.sentby_files ? 1 : 0,
      config.keep_upload_credit ? 1 : 0,
      config.free_resuming ? 1 : 0,
      config.callers_log ? 1 : 0,
      config.start_log ? 1 : 0,
      config.door_log ? 1 : 0,
      config.ud_log ? 1 : 0,
      config.log_host ? 1 : 0,
      config.telnet ? 1 : 0,
      config.ftp ? 1 : 0,
      config.disable_quick_logons ? 1 : 0,
      config.view_password ? 1 : 0,
      config.no_rad_boogie ? 1 : 0,
      JSON.stringify(config.nrams || [])
    );

    const result = this.getNodeConfig(config.node_number);
    if (!result) {
      throw new Error(`Failed to create node config ${config.node_number}`);
    }
    return result;
  }

  /**
   * Update node configuration
   */
  updateNodeConfig(nodeNumber: number, updates: Partial<NodeConfig>): NodeConfig {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'node_number' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(
        typeof value === 'boolean' ? (value ? 1 : 0) :
        Array.isArray(value) ? JSON.stringify(value) :
        value
      );
    });

    if (fields.length === 0) {
      const result = this.getNodeConfig(nodeNumber);
      if (!result) {
        throw new Error(`Node config ${nodeNumber} not found`);
      }
      return result;
    }

    values.push(nodeNumber);
    const stmt = this.prepare(`
      UPDATE node_config SET ${fields.join(', ')} WHERE node_number = ?
    `);

    stmt.run(...values);
    const result = this.getNodeConfig(nodeNumber);
    if (!result) {
      throw new Error(`Failed to update node config ${nodeNumber}`);
    }
    return result;
  }

  /**
   * Delete node configuration
   */
  deleteNodeConfig(nodeNumber: number): boolean {
    const stmt = this.prepare(`
      DELETE FROM node_config WHERE node_number = ?
    `);

    const result = stmt.run(nodeNumber);
    return result.changes > 0;
  }

  // ===== Conference Configuration =====

  /**
   * Get conference configuration by conference ID
   */
  getConferenceConfig(conferenceId: number): ConferenceConfig | null {
    const stmt = this.prepare(`
      SELECT * FROM conference_config WHERE conference_id = ?
    `);

    const row = stmt.get(conferenceId) as any;
    if (!row) return null;

    return this.mapConferenceConfigRow(row);
  }

  /**
   * Get all conference configurations
   */
  getConferenceConfigs(): ConferenceConfig[] {
    const stmt = this.prepare(`
      SELECT * FROM conference_config ORDER BY conference_id ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.mapConferenceConfigRow(row));
  }

  /**
   * Create conference configuration
   */
  createConferenceConfig(config: Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>): ConferenceConfig {
    const stmt = this.prepare(`
      INSERT INTO conference_config (
        conference_id, ndirs,
        dlpath_1, dlpath_2, dlpath_3, dlpath_4, dlpath_5, dlpath_6, dlpath_7, dlpath_8,
        dlpath_9, dlpath_10, dlpath_11, dlpath_12, dlpath_13, dlpath_14, dlpath_15, dlpath_16,
        ulpath_1, ulpath_2, ulpath_3, ulpath_4, ulpath_5, ulpath_6, ulpath_7, ulpath_8,
        ulpath_9, ulpath_10, ulpath_11, ulpath_12, ulpath_13, ulpath_14, ulpath_15, ulpath_16,
        force_newscan, exclude_ftp, private_conf, read_only,
        min_access_level, max_access_level
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      config.conference_id,
      config.ndirs || 0,
      config.dlpath_1 || '', config.dlpath_2 || '', config.dlpath_3 || '', config.dlpath_4 || '',
      config.dlpath_5 || '', config.dlpath_6 || '', config.dlpath_7 || '', config.dlpath_8 || '',
      config.dlpath_9 || '', config.dlpath_10 || '', config.dlpath_11 || '', config.dlpath_12 || '',
      config.dlpath_13 || '', config.dlpath_14 || '', config.dlpath_15 || '', config.dlpath_16 || '',
      config.ulpath_1 || '', config.ulpath_2 || '', config.ulpath_3 || '', config.ulpath_4 || '',
      config.ulpath_5 || '', config.ulpath_6 || '', config.ulpath_7 || '', config.ulpath_8 || '',
      config.ulpath_9 || '', config.ulpath_10 || '', config.ulpath_11 || '', config.ulpath_12 || '',
      config.ulpath_13 || '', config.ulpath_14 || '', config.ulpath_15 || '', config.ulpath_16 || '',
      config.force_newscan ? 1 : 0,
      config.exclude_ftp ? 1 : 0,
      config.private_conf ? 1 : 0,
      config.read_only ? 1 : 0,
      config.min_access_level || 1,
      config.max_access_level || 255
    );

    const result = this.getConferenceConfig(config.conference_id);
    if (!result) {
      throw new Error(`Failed to create conference config ${config.conference_id}`);
    }
    return result;
  }

  /**
   * Update conference configuration
   */
  updateConferenceConfig(conferenceId: number, updates: Partial<ConferenceConfig>): ConferenceConfig {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'conference_id' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    });

    if (fields.length === 0) {
      const result = this.getConferenceConfig(conferenceId);
      if (!result) {
        throw new Error(`Conference config ${conferenceId} not found`);
      }
      return result;
    }

    values.push(conferenceId);
    const stmt = this.prepare(`
      UPDATE conference_config SET ${fields.join(', ')} WHERE conference_id = ?
    `);

    stmt.run(...values);
    const result = this.getConferenceConfig(conferenceId);
    if (!result) {
      throw new Error(`Failed to update conference config ${conferenceId}`);
    }
    return result;
  }

  /**
   * Delete conference configuration
   */
  deleteConferenceConfig(conferenceId: number): boolean {
    const stmt = this.prepare(`
      DELETE FROM conference_config WHERE conference_id = ?
    `);

    const result = stmt.run(conferenceId);
    return result.changes > 0;
  }

  // ===== Doors =====

  /**
   * Get all doors
   */
  getDoors(): Door[] {
    const stmt = this.prepare(`
      SELECT * FROM doors ORDER BY door_name ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.mapDoorRow(row));
  }

  /**
   * Get door by ID
   */
  getDoor(id: number): Door | null {
    const stmt = this.prepare(`
      SELECT * FROM doors WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapDoorRow(row);
  }

  /**
   * Get door by command
   */
  getDoorByCommand(command: string): Door | null {
    const stmt = this.prepare(`
      SELECT * FROM doors WHERE door_command = ?
    `);

    const row = stmt.get(command) as any;
    if (!row) return null;

    return this.mapDoorRow(row);
  }

  /**
   * Create door
   */
  createDoor(door: Omit<Door, 'id' | 'created_at' | 'updated_at'>): Door {
    const stmt = this.prepare(`
      INSERT INTO doors (
        door_name, door_command, door_type,
        door_path, door_args, working_directory,
        priority, door_options, runtime_env,
        min_security_level, max_security_level, required_flags,
        time_limit, memory_limit,
        title, description, category,
        enabled
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?
      )
    `);

    const result = stmt.run(
      door.door_name,
      door.door_command,
      door.door_type,
      door.door_path,
      door.door_args || '',
      door.working_directory || '',
      door.priority || 'P3',
      JSON.stringify(door.door_options || []),
      door.runtime_env || 'AMIGA_68K',
      door.min_security_level || 1,
      door.max_security_level || 255,
      door.required_flags || '',
      door.time_limit || 0,
      door.memory_limit || 0,
      door.title || '',
      door.description || '',
      door.category || 'general',
      door.enabled !== false ? 1 : 0
    );

    return this.getDoor(result.lastInsertRowid as number)!;
  }

  /**
   * Update door
   */
  updateDoor(id: number, updates: Partial<Door>): Door {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(
        typeof value === 'boolean' ? (value ? 1 : 0) :
        Array.isArray(value) ? JSON.stringify(value) :
        value
      );
    });

    if (fields.length === 0) {
      return this.getDoor(id)!;
    }

    values.push(id);
    const stmt = this.prepare(`
      UPDATE doors SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
    return this.getDoor(id)!;
  }

  /**
   * Delete door
   */
  deleteDoor(id: number): boolean {
    const stmt = this.prepare(`
      DELETE FROM doors WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ===== System Languages (Singleton) =====

  /**
   * Get system languages configuration
   */
  getSystemLanguages(): SystemLanguages | null {
    const stmt = this.prepare(`
      SELECT * FROM system_languages WHERE id = 1
    `);

    const row = stmt.get() as any;
    if (!row) return null;

    return this.mapSystemLanguagesRow(row);
  }

  /**
   * Create system languages configuration
   */
  createSystemLanguages(config: Partial<SystemLanguages>): SystemLanguages {
    const stmt = this.prepare(`
      INSERT INTO system_languages (
        host_language, language_base_path, allow_user_selection
      ) VALUES (?, ?, ?)
    `);

    stmt.run(
      config.host_language || 'English',
      config.language_base_path || '',
      config.allow_user_selection !== false ? 1 : 0
    );

    return this.getSystemLanguages()!;
  }

  /**
   * Update system languages configuration
   */
  updateSystemLanguages(updates: Partial<SystemLanguages>): SystemLanguages {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    });

    if (fields.length === 0) {
      return this.getSystemLanguages()!;
    }

    const stmt = this.prepare(`
      UPDATE system_languages SET ${fields.join(', ')} WHERE id = 1
    `);

    stmt.run(...values);
    return this.getSystemLanguages()!;
  }

  // ===== Languages =====

  /**
   * Get all languages
   */
  getLanguages(): Language[] {
    const stmt = this.prepare(`
      SELECT * FROM languages ORDER BY language_number ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.mapLanguageRow(row));
  }

  /**
   * Get language by ID
   */
  getLanguage(id: number): Language | null {
    const stmt = this.prepare(`
      SELECT * FROM languages WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapLanguageRow(row);
  }

  /**
   * Get language by code
   */
  getLanguageByCode(code: string): Language | null {
    const stmt = this.prepare(`
      SELECT * FROM languages WHERE language_code = ?
    `);

    const row = stmt.get(code) as any;
    if (!row) return null;

    return this.mapLanguageRow(row);
  }

  /**
   * Create language
   */
  createLanguage(language: Omit<Language, 'id' | 'created_at' | 'updated_at'>): Language | null {
    const stmt = this.prepare(`
      INSERT INTO languages (
        language_number, title, language_code, file_path, enabled
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      language.language_number,
      language.title,
      language.language_code,
      language.file_path || '',
      language.enabled !== false ? 1 : 0
    );

    return this.getLanguage(result.lastInsertRowid as number);
  }

  /**
   * Update language
   */
  updateLanguage(id: number, updates: Partial<Language>): Language | null {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    });

    if (fields.length === 0) {
      return this.getLanguage(id);
    }

    values.push(id);
    const stmt = this.prepare(`
      UPDATE languages SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
    return this.getLanguage(id);
  }

  /**
   * Delete language
   */
  deleteLanguage(id: number): boolean {
    const stmt = this.prepare(`
      DELETE FROM languages WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ===== Protocols =====

  /**
   * Get all protocols
   */
  getProtocols(): Protocol[] {
    const stmt = this.prepare(`
      SELECT * FROM protocols ORDER BY protocol_name ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.mapProtocolRow(row));
  }

  /**
   * Get protocol by ID
   */
  getProtocol(id: number): Protocol | null {
    const stmt = this.prepare(`
      SELECT * FROM protocols WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapProtocolRow(row);
  }

  /**
   * Get protocol by code
   */
  getProtocolByCode(code: string): Protocol | null {
    const stmt = this.prepare(`
      SELECT * FROM protocols WHERE protocol_code = ?
    `);

    const row = stmt.get(code) as any;
    if (!row) return null;

    return this.mapProtocolRow(row);
  }

  /**
   * Create protocol
   */
  createProtocol(protocol: Omit<Protocol, 'id' | 'created_at' | 'updated_at'>): Protocol | null {
    const stmt = this.prepare(`
      INSERT INTO protocols (
        protocol_name, protocol_code,
        command, upload_command, download_command,
        batch_upload, batch_download, bidirectional,
        enabled, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      protocol.protocol_name,
      protocol.protocol_code,
      protocol.command,
      protocol.upload_command || '',
      protocol.download_command || '',
      protocol.batch_upload ? 1 : 0,
      protocol.batch_download ? 1 : 0,
      protocol.bidirectional ? 1 : 0,
      protocol.enabled !== false ? 1 : 0,
      protocol.is_default ? 1 : 0
    );

    return this.getProtocol(result.lastInsertRowid as number);
  }

  /**
   * Update protocol
   */
  updateProtocol(id: number, updates: Partial<Protocol>): Protocol | null {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'id' || key === 'created_at' || key === 'updated_at') return;

      fields.push(`${key} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    });

    if (fields.length === 0) {
      return this.getProtocol(id);
    }

    values.push(id);
    const stmt = this.prepare(`
      UPDATE protocols SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
    return this.getProtocol(id);
  }

  /**
   * Delete protocol
   */
  deleteProtocol(id: number): boolean {
    const stmt = this.prepare(`
      DELETE FROM protocols WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ===== Audit Log =====

  /**
   * Log configuration change
   */
  logConfigChange(
    tableName: string,
    recordId: number,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    userId: string | undefined,
    username: string,
    oldValues?: any,
    newValues?: any,
    ipAddress?: string,
    userAgent?: string
  ): ConfigAuditLog {
    const stmt = this.prepare(`
      INSERT INTO config_audit_log (
        table_name, record_id, action,
        old_values, new_values, changed_fields,
        user_id, username,
        ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Calculate changed fields
    const changedFields: string[] = [];
    if (oldValues && newValues) {
      Object.keys(newValues).forEach(key => {
        if (oldValues[key] !== newValues[key]) {
          changedFields.push(key);
        }
      });
    }

    const result = stmt.run(
      tableName,
      recordId,
      action,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      JSON.stringify(changedFields),
      userId || null,
      username,
      ipAddress || null,
      userAgent || null
    );

    return this.getAuditLogEntry(result.lastInsertRowid as number)!;
  }

  /**
   * Get audit log entry by ID
   */
  getAuditLogEntry(id: number): ConfigAuditLog | null {
    const stmt = this.prepare(`
      SELECT * FROM config_audit_log WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapAuditLogRow(row);
  }

  /**
   * Get audit log entries for a table/record
   */
  getAuditLog(tableName?: string, recordId?: number, limit: number = 100): ConfigAuditLog[] {
    let query = 'SELECT * FROM config_audit_log';
    const params: any[] = [];

    if (tableName) {
      query += ' WHERE table_name = ?';
      params.push(tableName);

      if (recordId !== undefined) {
        query += ' AND record_id = ?';
        params.push(recordId);
      }
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapAuditLogRow(row));
  }

  // ===== Row Mappers =====

  private mapSystemConfigRow(row: any): SystemConfig {
    return {
      id: row.id,
      bbs_name: row.bbs_name,
      sysop_name: row.sysop_name,
      location: row.location,
      phone: row.phone,
      email: row.email,
      website: row.website,
      min_password_length: row.min_password_length,
      min_password_strength: row.min_password_strength,
      max_password_fails: row.max_password_fails,
      password_security: row.password_security,
      strict_password_policy: Boolean(row.strict_password_policy),
      auto_validate: Boolean(row.auto_validate),
      confirm_deletions: Boolean(row.confirm_deletions),
      default_time_limit: row.default_time_limit,
      max_session_time: row.max_session_time,
      idle_timeout: row.idle_timeout,
      new_user_sec_level: row.new_user_sec_level,
      new_user_time_limit: row.new_user_time_limit,
      new_user_chat_limit: row.new_user_chat_limit,
      new_user_lines_per_screen: row.new_user_lines_per_screen,
      new_user_expert: Boolean(row.new_user_expert),
      new_user_ansi: Boolean(row.new_user_ansi),
      new_user_protocol: row.new_user_protocol,
      new_user_screen_type: row.new_user_screen_type,
      new_user_editor: row.new_user_editor,
      new_user_conf_access: row.new_user_conf_access,
      new_user_available_chat: Boolean(row.new_user_available_chat),
      new_user_quiet_node: Boolean(row.new_user_quiet_node),
      new_user_auto_rejoin: Boolean(row.new_user_auto_rejoin),
      ansi_enabled: Boolean(row.ansi_enabled),
      color_scheme: row.color_scheme,
      allow_custom_screens: Boolean(row.allow_custom_screens),
      language_base: row.language_base,
      default_language: row.default_language,
      max_conferences: row.max_conferences,
      max_message_bases: row.max_message_bases,
      max_file_areas: row.max_file_areas,
      max_nodes: row.max_nodes,
      file_check_enabled: Boolean(row.file_check_enabled),
      upload_check_virus: Boolean(row.upload_check_virus),
      upload_check_dupe: Boolean(row.upload_check_dupe),
      allow_internet_email: Boolean(row.allow_internet_email),
      smtp_server: row.smtp_server,
      smtp_port: row.smtp_port,
      smtp_username: row.smtp_username || '',
      smtp_password: row.smtp_password || '',
      smtp_ssl: Boolean(row.smtp_ssl),
      smtp_from_email: row.smtp_from_email || '',
      sysop_email: row.sysop_email || '',
      bbs_email: row.bbs_email || '',
      ftp_enabled: Boolean(row.ftp_enabled),
      ftp_host: row.ftp_host || '',
      ftp_port: row.ftp_port || 21,
      ftp_data_ports: row.ftp_data_ports || '',
      http_enabled: Boolean(row.http_enabled),
      http_host: row.http_host || '',
      http_port: row.http_port || 80,
      telnet_port: row.telnet_port ?? 64128,
      ssh_port: row.ssh_port ?? 31337,
      quiet_join: Boolean(row.quiet_join),
      convert_to_mb: Boolean(row.convert_to_mb),
      reg_key: row.reg_key || '',
      debug_mode: Boolean(row.debug_mode),
      log_level: row.log_level,
      log_retention_days: row.log_retention_days,
      sysop_debug_enabled: Boolean(row.sysop_debug_enabled),
      vapid_public_key: row.vapid_public_key || '',
      vapid_private_key: row.vapid_private_key || '',
      vapid_contact_email: row.vapid_contact_email || '',
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapNodeConfigRow(row: any): NodeConfig {
    return {
      id: row.id,
      node_number: row.node_number,
      node_start: row.node_start,
      priority: row.priority,
      capitol_files: Boolean(row.capitol_files),
      def_screens: Boolean(row.def_screens),
      no_mci_msg: Boolean(row.no_mci_msg),
      sysop_chat_color: row.sysop_chat_color,
      user_chat_color: row.user_chat_color,
      break_chat: Boolean(row.break_chat),
      sentby_files: Boolean(row.sentby_files),
      keep_upload_credit: Boolean(row.keep_upload_credit),
      free_resuming: Boolean(row.free_resuming),
      callers_log: Boolean(row.callers_log),
      start_log: Boolean(row.start_log),
      door_log: Boolean(row.door_log),
      ud_log: Boolean(row.ud_log),
      log_host: Boolean(row.log_host),
      telnet: Boolean(row.telnet),
      ftp: Boolean(row.ftp),
      disable_quick_logons: Boolean(row.disable_quick_logons),
      view_password: Boolean(row.view_password),
      no_rad_boogie: Boolean(row.no_rad_boogie),
      nrams: JSON.parse(row.nrams),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapConferenceConfigRow(row: any): ConferenceConfig {
    return {
      id: row.id,
      conference_id: row.conference_id,
      ndirs: row.ndirs,
      dlpath_1: row.dlpath_1,
      dlpath_2: row.dlpath_2,
      dlpath_3: row.dlpath_3,
      dlpath_4: row.dlpath_4,
      dlpath_5: row.dlpath_5,
      dlpath_6: row.dlpath_6,
      dlpath_7: row.dlpath_7,
      dlpath_8: row.dlpath_8,
      dlpath_9: row.dlpath_9,
      dlpath_10: row.dlpath_10,
      dlpath_11: row.dlpath_11,
      dlpath_12: row.dlpath_12,
      dlpath_13: row.dlpath_13,
      dlpath_14: row.dlpath_14,
      dlpath_15: row.dlpath_15,
      dlpath_16: row.dlpath_16,
      ulpath_1: row.ulpath_1,
      ulpath_2: row.ulpath_2,
      ulpath_3: row.ulpath_3,
      ulpath_4: row.ulpath_4,
      ulpath_5: row.ulpath_5,
      ulpath_6: row.ulpath_6,
      ulpath_7: row.ulpath_7,
      ulpath_8: row.ulpath_8,
      ulpath_9: row.ulpath_9,
      ulpath_10: row.ulpath_10,
      ulpath_11: row.ulpath_11,
      ulpath_12: row.ulpath_12,
      ulpath_13: row.ulpath_13,
      ulpath_14: row.ulpath_14,
      ulpath_15: row.ulpath_15,
      ulpath_16: row.ulpath_16,
      force_newscan: Boolean(row.force_newscan),
      no_newscan: Boolean(row.no_newscan),
      show_new_files: Boolean(row.show_new_files),
      no_new_files: Boolean(row.no_new_files),
      free_downloads: Boolean(row.free_downloads),
      exclude_ftp: Boolean(row.exclude_ftp),
      private_conf: Boolean(row.private_conf),
      read_only: Boolean(row.read_only),
      menu_prompt: row.menu_prompt,
      confdb_shared: row.confdb_shared,
      use_username: Boolean(row.use_username),
      use_realname: Boolean(row.use_realname),
      use_internetname: Boolean(row.use_internetname),
      min_access_level: row.min_access_level,
      max_access_level: row.max_access_level,
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapDoorRow(row: any): Door {
    return {
      id: row.id,
      door_name: row.door_name,
      door_command: row.door_command,
      door_type: row.door_type,
      door_path: row.door_path,
      door_args: row.door_args,
      working_directory: row.working_directory,
      priority: row.priority,
      door_options: JSON.parse(row.door_options),
      runtime_env: row.runtime_env,
      min_security_level: row.min_security_level,
      max_security_level: row.max_security_level,
      required_flags: row.required_flags,
      time_limit: row.time_limit,
      memory_limit: row.memory_limit,
      title: row.title,
      description: row.description,
      category: row.category,
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapSystemLanguagesRow(row: any): SystemLanguages {
    return {
      id: row.id,
      host_language: row.host_language,
      language_base_path: row.language_base_path,
      allow_user_selection: Boolean(row.allow_user_selection),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapLanguageRow(row: any): Language {
    return {
      id: row.id,
      language_number: row.language_number,
      title: row.title,
      language_code: row.language_code,
      file_path: row.file_path,
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapProtocolRow(row: any): Protocol {
    return {
      id: row.id,
      protocol_name: row.protocol_name,
      protocol_code: row.protocol_code,
      command: row.command,
      upload_command: row.upload_command,
      download_command: row.download_command,
      batch_upload: Boolean(row.batch_upload),
      batch_download: Boolean(row.batch_download),
      bidirectional: Boolean(row.bidirectional),
      enabled: Boolean(row.enabled),
      is_default: Boolean(row.is_default),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapAuditLogRow(row: any): ConfigAuditLog {
    return {
      id: row.id,
      table_name: row.table_name,
      record_id: row.record_id,
      action: row.action,
      old_values: row.old_values,
      new_values: row.new_values,
      changed_fields: JSON.parse(row.changed_fields),
      user_id: row.user_id,
      username: row.username,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      timestamp: new Date(row.timestamp * 1000)
    };
  }

  // ===== SECURITY LEVEL ACCESS (TOOLTYPE_ACCESS) =====

  getAllSecurityAccessForLevel(securityLevel: number): SecurityLevelAccess[] {
    const rows = this.prepare(`
      SELECT * FROM security_level_access
      WHERE security_level = ?
      ORDER BY acs_flag
    `).all(securityLevel);
    return rows.map(this.mapSecurityAccessRow.bind(this));
  }

  getSecurityAccessByFlag(securityLevel: number, acsFlag: string): SecurityLevelAccess | null {
    const row = this.prepare(`
      SELECT * FROM security_level_access
      WHERE security_level = ? AND acs_flag = ?
    `).get(securityLevel, acsFlag);
    return row ? this.mapSecurityAccessRow(row) : null;
  }

  createSecurityAccess(data: Omit<SecurityLevelAccess, 'id' | 'created_at' | 'updated_at'>): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.prepare(`
      INSERT INTO security_level_access (
        security_level, acs_flag, enabled, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.security_level,
      data.acs_flag,
      data.enabled ? 1 : 0,
      data.description || null,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  updateSecurityAccess(id: number, data: Partial<Omit<SecurityLevelAccess, 'id' | 'created_at' | 'updated_at'>>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const result = this.prepare(`
      UPDATE security_level_access
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  }

  deleteSecurityAccess(id: number): boolean {
    const result = this.prepare('DELETE FROM security_level_access WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapSecurityAccessRow(row: any): SecurityLevelAccess {
    return {
      id: row.id,
      security_level: row.security_level,
      acs_flag: row.acs_flag,
      enabled: Boolean(row.enabled),
      description: row.description,
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  // ===== DRIVES (TOOLTYPE_DRIVES) =====

  getAllDrives(): DriveConfig[] {
    const rows = this.prepare('SELECT * FROM drives ORDER BY drive_number').all();
    return rows.map(this.mapDriveRow.bind(this));
  }

  getDriveById(id: number): DriveConfig | null {
    const row = this.prepare('SELECT * FROM drives WHERE id = ?').get(id);
    return row ? this.mapDriveRow(row) : null;
  }

  getDriveByNumber(driveNumber: number): DriveConfig | null {
    const row = this.prepare('SELECT * FROM drives WHERE drive_number = ?').get(driveNumber);
    return row ? this.mapDriveRow(row) : null;
  }

  createDrive(data: Omit<DriveConfig, 'id' | 'created_at' | 'updated_at'>): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.prepare(`
      INSERT INTO drives (
        drive_number, drive_path, enabled, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.drive_number,
      data.drive_path,
      data.enabled ? 1 : 0,
      data.description || null,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  updateDrive(id: number, data: Partial<Omit<DriveConfig, 'id' | 'created_at' | 'updated_at'>>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.drive_number !== undefined) { fields.push('drive_number = ?'); values.push(data.drive_number); }
    if (data.drive_path !== undefined) { fields.push('drive_path = ?'); values.push(data.drive_path); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }

    if (fields.length === 0) return false;

    values.push(id);
    const result = this.prepare(`UPDATE drives SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  deleteDrive(id: number): boolean {
    const result = this.prepare('DELETE FROM drives WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapDriveRow(row: any): DriveConfig {
    return {
      id: row.id,
      drive_number: row.drive_number,
      drive_path: row.drive_path,
      enabled: Boolean(row.enabled),
      description: row.description,
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  // ===== COMPUTER TYPES (TOOLTYPE_COMPUTERLIST) =====

  getAllComputerTypes(): ComputerType[] {
    const rows = this.prepare('SELECT * FROM computer_types ORDER BY computer_number').all();
    return rows.map(this.mapComputerTypeRow.bind(this));
  }

  getComputerTypeById(id: number): ComputerType | null {
    const row = this.prepare('SELECT * FROM computer_types WHERE id = ?').get(id);
    return row ? this.mapComputerTypeRow(row) : null;
  }

  createComputerType(data: Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.prepare(`
      INSERT INTO computer_types (
        computer_number, computer_name, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(data.computer_number, data.computer_name, data.enabled ? 1 : 0, now, now);
    return result.lastInsertRowid as number;
  }

  updateComputerType(id: number, data: Partial<Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.computer_number !== undefined) { fields.push('computer_number = ?'); values.push(data.computer_number); }
    if (data.computer_name !== undefined) { fields.push('computer_name = ?'); values.push(data.computer_name); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    if (fields.length === 0) return false;

    values.push(id);
    const result = this.prepare(`UPDATE computer_types SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  deleteComputerType(id: number): boolean {
    const result = this.prepare('DELETE FROM computer_types WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapComputerTypeRow(row: any): ComputerType {
    return {
      id: row.id,
      computer_number: row.computer_number,
      computer_name: row.computer_name,
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  // ===== SCREEN TYPES (TOOLTYPE_SCREENTYPES) =====

  getAllScreenTypes(): ScreenType[] {
    const rows = this.prepare('SELECT * FROM screen_types ORDER BY screen_number').all();
    return rows.map(this.mapScreenTypeRow.bind(this));
  }

  getScreenTypeById(id: number): ScreenType | null {
    const row = this.prepare('SELECT * FROM screen_types WHERE id = ?').get(id);
    return row ? this.mapScreenTypeRow(row) : null;
  }

  createScreenType(data: Omit<ScreenType, 'id' | 'created_at' | 'updated_at'>): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.prepare(`
      INSERT INTO screen_types (
        screen_number, screen_type, screen_title, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.screen_number, data.screen_type, data.screen_title, data.enabled ? 1 : 0, now, now);
    return result.lastInsertRowid as number;
  }

  updateScreenType(id: number, data: Partial<Omit<ScreenType, 'id' | 'created_at' | 'updated_at'>>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.screen_number !== undefined) { fields.push('screen_number = ?'); values.push(data.screen_number); }
    if (data.screen_type !== undefined) { fields.push('screen_type = ?'); values.push(data.screen_type); }
    if (data.screen_title !== undefined) { fields.push('screen_title = ?'); values.push(data.screen_title); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    if (fields.length === 0) return false;

    values.push(id);
    const result = this.prepare(`UPDATE screen_types SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  deleteScreenType(id: number): boolean {
    const result = this.prepare('DELETE FROM screen_types WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapScreenTypeRow(row: any): ScreenType {
    return {
      id: row.id,
      screen_number: row.screen_number,
      screen_type: row.screen_type,
      screen_title: row.screen_title,
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  // ===== FILE CHECKERS (TOOLTYPE_FCHECK) =====

  getAllFileCheckers(): FileChecker[] {
    const rows = this.prepare('SELECT * FROM file_checkers ORDER BY checker_name').all();
    return rows.map(this.mapFileCheckerRow.bind(this));
  }

  getFileCheckerById(id: number): FileChecker | null {
    const row = this.prepare('SELECT * FROM file_checkers WHERE id = ?').get(id);
    return row ? this.mapFileCheckerRow(row) : null;
  }

  createFileChecker(data: Omit<FileChecker, 'id' | 'created_at' | 'updated_at'>): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.prepare(`
      INSERT INTO file_checkers (
        checker_name, checker_path, options, stack_size, priority, script_path, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.checker_name,
      data.checker_path,
      data.options,
      data.stack_size,
      data.priority,
      data.script_path || null,
      data.enabled ? 1 : 0,
      now,
      now
    );
    return result.lastInsertRowid as number;
  }

  updateFileChecker(id: number, data: Partial<Omit<FileChecker, 'id' | 'created_at' | 'updated_at'>>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.checker_name !== undefined) { fields.push('checker_name = ?'); values.push(data.checker_name); }
    if (data.checker_path !== undefined) { fields.push('checker_path = ?'); values.push(data.checker_path); }
    if (data.options !== undefined) { fields.push('options = ?'); values.push(data.options); }
    if (data.stack_size !== undefined) { fields.push('stack_size = ?'); values.push(data.stack_size); }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
    if (data.script_path !== undefined) { fields.push('script_path = ?'); values.push(data.script_path); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

    if (fields.length === 0) return false;

    values.push(id);
    const result = this.prepare(`UPDATE file_checkers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  deleteFileChecker(id: number): boolean {
    const result = this.prepare('DELETE FROM file_checkers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getFileCheckerErrors(checkerId: number): FileCheckerError[] {
    const rows = this.prepare(`
      SELECT * FROM file_checker_errors
      WHERE file_checker_id = ?
      ORDER BY error_number
    `).all(checkerId);
    return rows.map(this.mapFileCheckerErrorRow.bind(this));
  }

  createFileCheckerError(data: Omit<FileCheckerError, 'id' | 'created_at' | 'updated_at'>): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.prepare(`
      INSERT INTO file_checker_errors (
        file_checker_id, error_number, error_pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(data.file_checker_id, data.error_number, data.error_pattern, now, now);
    return result.lastInsertRowid as number;
  }

  deleteFileCheckerError(id: number): boolean {
    const result = this.prepare('DELETE FROM file_checker_errors WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapFileCheckerRow(row: any): FileChecker {
    return {
      id: row.id,
      checker_name: row.checker_name,
      checker_path: row.checker_path,
      options: row.options,
      stack_size: row.stack_size,
      priority: row.priority,
      script_path: row.script_path,
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }

  private mapFileCheckerErrorRow(row: any): FileCheckerError {
    return {
      id: row.id,
      file_checker_id: row.file_checker_id,
      error_number: row.error_number,
      error_pattern: row.error_pattern,
      created_at: new Date(row.created_at * 1000),
      updated_at: new Date(row.updated_at * 1000)
    };
  }
}
