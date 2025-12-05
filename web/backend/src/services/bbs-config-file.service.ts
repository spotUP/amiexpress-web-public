/**
 * BBS Config File Service
 * Reads/writes system configuration from bbsConfig.info (AmiExpress format)
 *
 * This replaces database storage for system configuration.
 * All system config is stored in tooltypes in bbsConfig.info, just like original AmiExpress.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';
import type { SystemConfig } from '../database/types';

export interface BBSConfigData {
  // Identity
  bbs_name?: string;
  sysop_name?: string;
  location?: string;
  phone?: string;
  email?: string;
  website?: string;

  // Security
  min_password_length?: number;
  min_password_strength?: number;
  max_password_fails?: number;
  password_security?: string;
  strict_password_policy?: boolean;
  auto_validate?: boolean;
  confirm_deletions?: boolean;

  // Session Settings
  default_time_limit?: number;
  max_session_time?: number;
  idle_timeout?: number;

  // New User Defaults
  new_user_sec_level?: number;
  new_user_time_limit?: number;
  new_user_chat_limit?: number;
  new_user_lines_per_screen?: number;
  new_user_expert?: boolean;
  new_user_ansi?: boolean;
  new_user_protocol?: string;
  new_user_screen_type?: string;
  new_user_editor?: string;
  new_user_conf_access?: string;
  new_user_available_chat?: boolean;
  new_user_quiet_node?: boolean;
  new_user_auto_rejoin?: boolean;

  // Display
  ansi_enabled?: boolean;
  color_scheme?: string;
  allow_custom_screens?: boolean;

  // Language
  language_base?: string;
  default_language?: string;

  // Limits
  max_conferences?: number;
  max_message_bases?: number;
  max_file_areas?: number;
  max_nodes?: number;

  // File Management
  file_check_enabled?: boolean;
  upload_check_virus?: boolean;
  upload_check_dupe?: boolean;

  // Mail & SMTP
  allow_internet_email?: boolean;
  smtp_server?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_ssl?: boolean;
  smtp_from_email?: string;
  sysop_email?: string;
  bbs_email?: string;

  // FTP Server
  ftp_enabled?: boolean;
  ftp_host?: string;
  ftp_port?: number;
  ftp_data_ports?: string;

  // HTTP Server
  http_enabled?: boolean;
  http_host?: string;
  http_port?: number;

  // BBS Server Ports
  telnet_port?: number;
  ssh_port?: number;

  // System Behavior
  quiet_join?: boolean;
  convert_to_mb?: boolean;
  reg_key?: string;

  // Logging
  debug_mode?: boolean;
  log_level?: string;
  log_retention_days?: number;
}

/**
 * Tooltype name mapping (AmiExpress format → internal field name)
 */
const TOOLTYPE_MAP: Record<string, keyof BBSConfigData> = {
  // Identity
  'BBS_NAME': 'bbs_name',
  'SYSOP_NAME': 'sysop_name',
  'LOCATION': 'location',
  'PHONE': 'phone',
  'EMAIL': 'email',
  'WEBSITE': 'website',

  // Security
  'MIN_PASSWORD_LENGTH': 'min_password_length',
  'MIN_PASSWORD_STRENGTH': 'min_password_strength',
  'MAX_PASSWORD_FAILS': 'max_password_fails',
  'PASSWORD_SECURITY': 'password_security',
  'STRICT_PASSWORD_POLICY': 'strict_password_policy',
  'AUTO_VALIDATE': 'auto_validate',
  'CONFIRM_DELETIONS': 'confirm_deletions',

  // Session
  'DEFAULT_TIME_LIMIT': 'default_time_limit',
  'MAX_SESSION_TIME': 'max_session_time',
  'IDLE_TIMEOUT': 'idle_timeout',

  // New User Defaults
  'NEW_USER_SEC_LEVEL': 'new_user_sec_level',
  'NEW_USER_TIME_LIMIT': 'new_user_time_limit',
  'NEW_USER_CHAT_LIMIT': 'new_user_chat_limit',
  'NEW_USER_LINES_PER_SCREEN': 'new_user_lines_per_screen',
  'NEW_USER_EXPERT': 'new_user_expert',
  'NEW_USER_ANSI': 'new_user_ansi',
  'NEW_USER_PROTOCOL': 'new_user_protocol',
  'NEW_USER_SCREEN_TYPE': 'new_user_screen_type',
  'NEW_USER_EDITOR': 'new_user_editor',
  'NEW_USER_CONF_ACCESS': 'new_user_conf_access',
  'NEW_USER_AVAILABLE_CHAT': 'new_user_available_chat',
  'NEW_USER_QUIET_NODE': 'new_user_quiet_node',
  'NEW_USER_AUTO_REJOIN': 'new_user_auto_rejoin',

  // Display
  'ANSI_ENABLED': 'ansi_enabled',
  'COLOR_SCHEME': 'color_scheme',
  'ALLOW_CUSTOM_SCREENS': 'allow_custom_screens',

  // Language
  'LANGUAGE_BASE': 'language_base',
  'DEFAULT_LANGUAGE': 'default_language',

  // Limits
  'MAX_CONFERENCES': 'max_conferences',
  'MAX_MESSAGE_BASES': 'max_message_bases',
  'MAX_FILE_AREAS': 'max_file_areas',
  'MAX_NODES': 'max_nodes',

  // File Management
  'FILE_CHECK_ENABLED': 'file_check_enabled',
  'UPLOAD_CHECK_VIRUS': 'upload_check_virus',
  'UPLOAD_CHECK_DUPE': 'upload_check_dupe',

  // Mail & SMTP
  'ALLOW_INTERNET_EMAIL': 'allow_internet_email',
  'SMTP_HOST': 'smtp_server',
  'SMTP_PORT': 'smtp_port',
  'SMTP_USERNAME': 'smtp_username',
  'SMTP_PASSWORD': 'smtp_password',
  'SMTP_SSL': 'smtp_ssl',
  'SMTP_FROM_EMAIL': 'smtp_from_email',
  'SYSOP_EMAIL': 'sysop_email',
  'BBS_EMAIL': 'bbs_email',

  // FTP Server
  'FTP_ENABLED': 'ftp_enabled',
  'FTPHOST': 'ftp_host',
  'FTPPORT': 'ftp_port',
  'FTPDATAPORT': 'ftp_data_ports',

  // HTTP Server
  'HTTP_ENABLED': 'http_enabled',
  'HTTP_HOST': 'http_host',
  'HTTP_PORT': 'http_port',

  // BBS Server Ports
  'TELNET_PORT': 'telnet_port',
  'SSH_PORT': 'ssh_port',

  // System Behavior
  'QUIET_JOIN': 'quiet_join',
  'CONVERT_TO_MB': 'convert_to_mb',
  'REGKEY': 'reg_key',

  // Logging
  'DEBUG_MODE': 'debug_mode',
  'LOG_LEVEL': 'log_level',
  'LOG_RETENTION_DAYS': 'log_retention_days',
};

/**
 * Reverse mapping (internal field name → AmiExpress tooltype name)
 */
const REVERSE_TOOLTYPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TOOLTYPE_MAP).map(([k, v]) => [v, k])
);

/**
 * Load system configuration from bbsConfig.info
 */
export function loadBBSConfig(bbsRoot: string): BBSConfigData {
  const configPath = path.join(bbsRoot, 'bbsConfig.info');

  if (!fs.existsSync(configPath)) {
    console.log('[BBSConfig] bbsConfig.info not found, using defaults');
    return getDefaultConfig();
  }

  try {
    const buffer = fs.readFileSync(configPath);
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    const config: BBSConfigData = {};

    // Parse each tooltype
    for (const [rawKey, rawValue] of parsed.toolTypes.entries()) {
      const key = rawKey.toUpperCase();
      const fieldName = TOOLTYPE_MAP[key];

      if (!fieldName) {
        // Unknown tooltype, skip
        continue;
      }

      // Parse value based on field type
      if (typeof getDefaultConfig()[fieldName] === 'boolean') {
        // Boolean flag (presence = true)
        config[fieldName] = true as any;
      } else if (typeof getDefaultConfig()[fieldName] === 'number') {
        // Numeric value
        const num = parseInt(rawValue, 10);
        if (!isNaN(num)) {
          config[fieldName] = num as any;
        }
      } else {
        // String value
        config[fieldName] = rawValue as any;
      }
    }

    console.log('[BBSConfig] Loaded configuration from bbsConfig.info');
    return { ...getDefaultConfig(), ...config };
  } catch (error) {
    console.error('[BBSConfig] Failed to read bbsConfig.info:', error);
    return getDefaultConfig();
  }
}

/**
 * Save system configuration to bbsConfig.info
 */
export function saveBBSConfig(bbsRoot: string, config: Partial<BBSConfigData>): void {
  const configPath = path.join(bbsRoot, 'bbsConfig.info');

  try {
    // Read existing file to preserve structure
    let existing: Map<string, string> = new Map();
    if (fs.existsSync(configPath)) {
      const buffer = fs.readFileSync(configPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);
      existing = parsed.toolTypes;
    }

    // Update tooltypes with new values
    for (const [fieldName, value] of Object.entries(config)) {
      if (value === undefined) continue;

      const tooltypeName = REVERSE_TOOLTYPE_MAP[fieldName];
      if (!tooltypeName) continue;

      if (typeof value === 'boolean') {
        // Boolean: present = true, absent = false
        if (value) {
          existing.set(tooltypeName, '');
        } else {
          existing.delete(tooltypeName);
        }
      } else if (typeof value === 'number') {
        existing.set(tooltypeName, value.toString());
      } else {
        existing.set(tooltypeName, String(value));
      }
    }

    // Build new .info file content
    // For now, we'll use a simple format - can enhance later with icon.library format
    const tooltypes: string[] = [];
    for (const [key, value] of existing.entries()) {
      if (value === '') {
        tooltypes.push(key);
      } else {
        tooltypes.push(`${key}=${value}`);
      }
    }

    // Write tooltypes as simple text format for now
    // TODO: Use proper .info file format with icon.library
    const content = tooltypes.join('\n') + '\n';

    // Backup existing file
    if (fs.existsSync(configPath)) {
      const backupPath = configPath + '.backup';
      fs.copyFileSync(configPath, backupPath);
    }

    fs.writeFileSync(configPath + '.txt', content, 'utf-8');
    console.log('[BBSConfig] Saved configuration to bbsConfig.info.txt');
    console.log('[BBSConfig] NOTE: Full .info format writing not yet implemented');
  } catch (error) {
    console.error('[BBSConfig] Failed to save bbsConfig.info:', error);
    throw error;
  }
}

/**
 * Get default configuration values
 */
function getDefaultConfig(): BBSConfigData {
  return {
    bbs_name: 'AmiExpress BBS',
    sysop_name: 'Sysop',
    location: '',
    phone: '',
    email: '',
    website: '',
    min_password_length: 8,
    min_password_strength: 0,
    max_password_fails: -1,
    password_security: 'bcrypt',
    strict_password_policy: false,
    auto_validate: false,
    confirm_deletions: true,
    default_time_limit: -1,
    max_session_time: -1,
    idle_timeout: 10,
    new_user_sec_level: 30,
    new_user_time_limit: -1,
    new_user_chat_limit: -1,
    new_user_lines_per_screen: 23,
    new_user_expert: false,
    new_user_ansi: true,
    new_user_protocol: 'ZMODEM',
    new_user_screen_type: 'ANSI',
    new_user_editor: 'FULL',
    new_user_conf_access: 'XXX',
    new_user_available_chat: true,
    new_user_quiet_node: false,
    new_user_auto_rejoin: true,
    ansi_enabled: true,
    color_scheme: 'standard',
    allow_custom_screens: true,
    language_base: 'Languages',
    default_language: 'English',
    max_conferences: 32,
    max_message_bases: 256,
    max_file_areas: 256,
    max_nodes: 255,
    file_check_enabled: true,
    upload_check_virus: false,
    upload_check_dupe: true,
    allow_internet_email: false,
    smtp_server: '',
    smtp_port: 25,
    smtp_username: '',
    smtp_password: '',
    smtp_ssl: false,
    smtp_from_email: '',
    sysop_email: '',
    bbs_email: '',
    ftp_enabled: false,
    ftp_host: '',
    ftp_port: 21,
    ftp_data_ports: '',
    http_enabled: false,
    http_host: '',
    http_port: 80,
    telnet_port: 2323,
    ssh_port: 2222,
    quiet_join: false,
    convert_to_mb: false,
    reg_key: '',
    debug_mode: false,
    log_level: 'info',
    log_retention_days: 90,
  };
}
