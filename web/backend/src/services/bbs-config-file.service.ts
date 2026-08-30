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
import { InfoFileWriteError, parseInfoFile, updateTooltype, writeInfoFile } from '../utils/info-file.util';
import type { SystemConfig } from '../database/types';
import { isSensitiveField } from '../utils/secrets-encryption.util';
import { getSystemTime } from '../utils/date-time.util';

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
  password_expiry_days?: number;   // express.e:29785 — PASSWORD_EXPIRY_DAYS tooltype (0 = disabled)
  password_security?: string;
  strict_password_policy?: boolean;
  auto_validate?: boolean;
  confirm_deletions?: boolean;
  system_password?: string;        // express.e:29329 — cmds.sysPass — ACP.e:2630 SYSTEM_PASSWORD tooltype

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
  hold_access_level?: number; // express.e:346 - Security level required to access HOLD directory (default 201)
  capitalize_filenames?: boolean; // express.e:19253 - Convert uploaded filenames to uppercase (LVL_CAPITOLS_in_FILE)

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
  // express.e:sopt.toggles[TOGGLES_CREDITBYKB] — count UL/DL bytes in kilobytes instead of bytes
  credit_by_kb?: boolean;

  // Logging
  debug_mode?: boolean;
  log_level?: string;
  log_retention_days?: number;
  sysop_debug_enabled?: boolean;

  // AREXX engine override — 'auto' (default), 'native', 'ts'.
  // 'auto' picks native when System/RexxMast is present, TS otherwise.
  arexx_engine?: string;
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
  'PASSWORD_EXPIRY_DAYS': 'password_expiry_days',   // express.e:29785
  'PASSWORD_SECURITY': 'password_security',
  'STRICT_PASSWORD_POLICY': 'strict_password_policy',
  'AUTO_VALIDATE': 'auto_validate',
  'CONFIRM_DELETIONS': 'confirm_deletions',
  'SYSTEM_PASSWORD': 'system_password',             // express.e:29329 ACP.e:2630 cmds.sysPass

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
  'HOLD_ACCESS_LEVEL': 'hold_access_level',
  'LVL_CAPITOLS_in_FILE': 'capitalize_filenames',

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
  // express.e sopt.toggles[TOGGLES_CREDITBYKB] — counts UL/DL in KB instead of bytes
  'CREDITBYKB': 'credit_by_kb',

  // Logging
  'DEBUG_MODE': 'debug_mode',
  'LOG_LEVEL': 'log_level',
  'LOG_RETENTION_DAYS': 'log_retention_days',
  'SYSOP_DEBUG_OUTPUT': 'sysop_debug_enabled',
  'AREXX_ENGINE': 'arexx_engine',
};

/**
 * Reverse mapping (internal field name → AmiExpress tooltype name)
 */
const REVERSE_TOOLTYPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TOOLTYPE_MAP).map(([k, v]) => [v, k])
);

/**
 * Which tooltype in bbsConfig.info each configuration field is written to.
 *
 * Served to the admin so a form field can show the key it edits - a sysop
 * reading `SYSOP_NAME` under a field can cross-check it against the file on
 * disk, which is the actual source of truth. A copy of this map in the
 * frontend would be a second source of truth for something the writer owns,
 * so the writer publishes it instead.
 */
export function getConfigTooltypeKeys(): Record<string, string> {
  return { ...REVERSE_TOOLTYPE_MAP };
}

/**
 * Upper-cased tooltype name -> the canonical spelling in TOOLTYPE_MAP.
 *
 * Needed because one tooltype is genuinely not upper case:
 * LVL_CAPITOLS_in_FILE, exactly as AmiExpress declares it (axcommon.e:53).
 * Upper-casing every key on the way in meant that one could never be matched,
 * so "capitalise uploaded filenames" could be saved and never read back - the
 * form showed it off however many times a sysop switched it on.
 */
const CANONICAL_TOOLTYPE_KEY: Record<string, string> = Object.fromEntries(
  Object.keys(TOOLTYPE_MAP).map(key => [key.toUpperCase(), key])
);

function normalizeTooltypeKey(rawKey: string): string {
  const upper = rawKey.toUpperCase();
  if (CANONICAL_TOOLTYPE_KEY[upper]) {
    return CANONICAL_TOOLTYPE_KEY[upper];
  }

  const stripped = upper.replace(/^[^A-Z0-9]+/, '');
  return CANONICAL_TOOLTYPE_KEY[stripped] ?? upper;
}

function parseTooltypesTextFile(filePath: string): Map<string, string> {
  const toolTypes = new Map<string, string>();

  try {
    const contents = fs.readFileSync(filePath, 'utf-8');
    const lines = contents.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
      if (line.startsWith('!')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        const keyOnly = normalizeTooltypeKey(line);
        if (!TOOLTYPE_MAP[keyOnly]) continue;
        toolTypes.set(keyOnly, '');
        continue;
      }

      const rawKey = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (!rawKey) continue;

      const key = normalizeTooltypeKey(rawKey);
      if (!TOOLTYPE_MAP[key]) continue;

      toolTypes.set(key, value);
    }
  } catch (error) {
console.error('[BBSConfig] Failed to read bbsConfig.info.txt:', error);
  }

  return toolTypes;
}

function removeTooltype(info: { tooltypes: { key: string }[] }, key: string): void {
  const upperKey = key.toUpperCase();
  const index = info.tooltypes.findIndex(tt => tt.key === upperKey);
  if (index !== -1) {
    info.tooltypes.splice(index, 1);
  }
}

/**
 * Load system configuration from bbsConfig.info
 */
export function loadBBSConfig(bbsRoot: string): BBSConfigData {
  const configPath = path.join(bbsRoot, 'bbsConfig.info');
  const configTextPath = configPath + '.txt';

  const mergedToolTypes = new Map<string, string>();

  if (fs.existsSync(configPath)) {
    try {
      const buffer = fs.readFileSync(configPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);
      for (const [rawKey, rawValue] of parsed.toolTypes.entries()) {
        const key = normalizeTooltypeKey(rawKey);
        mergedToolTypes.set(key, rawValue);
      }
console.log('[BBSConfig] Loaded configuration from bbsConfig.info');
    } catch (error) {
console.error('[BBSConfig] Failed to read bbsConfig.info:', error);
    }
  }

  if (fs.existsSync(configTextPath)) {
    const textToolTypes = parseTooltypesTextFile(configTextPath);

    // Both files are complete snapshots - the writer builds the text
    // companion from the whole merged tooltype set - so the NEWER of the two
    // is the truth and the older one is stale, not a partial override.
    //
    // Merging the text file over the icon looked equivalent and was not: a
    // boolean tooltype is expressed by its PRESENCE, so switching one off
    // removes it from the text file, and a merge then read it straight back
    // out of the icon. Turning any flag off silently did nothing on a board
    // whose icon the writer cannot update.
    const textIsNewer =
      !fs.existsSync(configPath) ||
      fs.statSync(configTextPath).mtimeMs >= fs.statSync(configPath).mtimeMs;

    if (textIsNewer) {
      mergedToolTypes.clear();
      for (const [key, value] of textToolTypes.entries()) {
        mergedToolTypes.set(key, value);
      }
console.log('[BBSConfig] Loaded configuration from bbsConfig.info.txt (newer than the icon)');
    } else {
console.log('[BBSConfig] Ignoring bbsConfig.info.txt; the icon file is newer');
    }
  }

  if (mergedToolTypes.size === 0) {
console.log('[BBSConfig] bbsConfig.info not found, using defaults');
    return getDefaultConfig();
  }

  try {
    const config: Partial<BBSConfigData> = {};

    // A boolean tooltype means what AmiExpress means by it: present is on,
    // absent is off. Once a configuration file exists, EVERY flag starts off
    // and is switched on only by being in the file.
    //
    // Without this, a flag whose default is true (confirm_deletions,
    // ansi_enabled, file_check_enabled and five others) could not be turned
    // off at all: unchecking it removed the tooltype, and the default put it
    // straight back on the next read.
    const defaults = getDefaultConfig() as Record<string, unknown>;
    for (const [field, value] of Object.entries(defaults)) {
      if (typeof value === 'boolean') {
        (config as any)[field] = false;
      }
    }

    // Parse each tooltype
    for (const [rawKey, rawValue] of mergedToolTypes.entries()) {
      const key = normalizeTooltypeKey(rawKey);
      const fieldName = TOOLTYPE_MAP[key];

      if (!fieldName) {
        // Unknown tooltype, skip
        continue;
      }

      // Parse value based on field type
      if (typeof getDefaultConfig()[fieldName] === 'boolean') {
        // Boolean flag (presence = true)
        (config as any)[fieldName] = true;
      } else if (typeof getDefaultConfig()[fieldName] === 'number') {
        // Numeric value
        const num = parseInt(rawValue, 10);
        if (!isNaN(num)) {
          (config as any)[fieldName] = num;
        }
      } else {
        // String value
        (config as any)[fieldName] = rawValue;
      }
    }

    return { ...getDefaultConfig(), ...config };
  } catch (error) {
console.error('[BBSConfig] Failed to parse configuration:', error);
    return getDefaultConfig();
  }
}

/**
 * Save system configuration to bbsConfig.info
 */
export interface SaveBBSConfigResult {
  /** The text companion, which this BBS reads, was updated. */
  textFileWritten: boolean;
  /** The Amiga icon file was updated too. */
  infoFileWritten: boolean;
  /** Set when the two files now disagree, and why. */
  warning?: string;
}

/**
 * A tooltype key as it should appear in the text companion.
 *
 * The heuristic extraction used on an icon whose tooltype array cannot be
 * located picks up fragments of the surrounding binary - single letters, bare
 * digits, and a stray length byte glued to the front of a real key
 * ("6FTPDATAPORT=50101,..."). Writing those back multiplied them on every
 * save. A leading run of digits is stripped; anything that still does not
 * look like a key is dropped.
 */
function cleanTooltypeKey(key: string): string | null {
  const stripped = key.replace(/^[0-9]+(?=[A-Za-z])/, '');
  return /^[A-Za-z][A-Za-z0-9_.]*$/.test(stripped) && stripped.length >= 2 ? stripped : null;
}

export function saveBBSConfig(bbsRoot: string, config: Partial<BBSConfigData>): SaveBBSConfigResult {
  const configPath = path.join(bbsRoot, 'bbsConfig.info');
  const configTextPath = configPath + '.txt';

  try {
    // Read existing file to preserve structure
    let existing: Map<string, string> = new Map();
    if (fs.existsSync(configPath)) {
      const buffer = fs.readFileSync(configPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);
      for (const [rawKey, rawValue] of parsed.toolTypes.entries()) {
        const key = normalizeTooltypeKey(rawKey);
        if (TOOLTYPE_MAP[key]) {
          existing.set(key, rawValue);
        } else {
          existing.set(rawKey.toUpperCase(), rawValue);
        }
      }
    }

    if (fs.existsSync(configTextPath)) {
      const textToolTypes = parseTooltypesTextFile(configTextPath);
      for (const [key, value] of textToolTypes.entries()) {
        existing.set(key, value);
      }
    }

    const infoFile = fs.existsSync(configPath) ? parseInfoFile(configPath) : null;

    // Update tooltypes with new values
    for (const [fieldName, value] of Object.entries(config)) {
      if (value === undefined) continue;

      const tooltypeName = REVERSE_TOOLTYPE_MAP[fieldName];
      if (!tooltypeName) continue;

      if (typeof value === 'boolean') {
        // Boolean: present = true, absent = false
        if (value) {
          existing.set(tooltypeName, '');
          if (infoFile) {
            updateTooltype(infoFile, tooltypeName, '', false);
          }
        } else {
          existing.delete(tooltypeName);
          if (infoFile) {
            removeTooltype(infoFile, tooltypeName);
          }
        }
      } else if (typeof value === 'number') {
        existing.set(tooltypeName, value.toString());
        if (infoFile) {
          updateTooltype(infoFile, tooltypeName, value.toString(), false);
        }
      } else {
        existing.set(tooltypeName, String(value));
        if (infoFile) {
          updateTooltype(infoFile, tooltypeName, String(value), false);
        }
      }
    }

    // The binary .info is written below via writeInfoFile() (icon.library
    // format). Build a companion plain-text file (bbsConfig.info.txt) for
    // humans and tooling that cannot parse Amiga icon files. loadBBSConfig
    // applies this file AFTER the .info, so it is what this BBS actually
    // reads.
    const tooltypes: string[] = [];
    for (const [key, value] of existing.entries()) {
      const cleanKey = cleanTooltypeKey(key);
      if (!cleanKey) continue;
      if (value === '') {
        tooltypes.push(cleanKey);
      } else {
        tooltypes.push(`${cleanKey}=${value}`);
      }
    }
    const content = tooltypes.join('\n') + '\n';

    // Backup existing file
    if (fs.existsSync(configPath)) {
      const backupPath = configPath + '.backup';
      fs.copyFileSync(configPath, backupPath);
    }

    // The text companion goes first, and on its own. It used to be written
    // after the .info, so an icon the writer refuses to touch - one whose
    // tooltype array it could only read heuristically - threw before this
    // line and the sysop's change was lost entirely while the form reported
    // a failure with nothing saved anywhere.
    fs.writeFileSync(configTextPath, content, 'utf-8');
console.log('[BBSConfig] Saved configuration to bbsConfig.info.txt');

    if (!infoFile) {
console.warn('[BBSConfig] bbsConfig.info not found; wrote bbsConfig.info.txt only');
      return { textFileWritten: true, infoFileWritten: false, warning: 'bbsConfig.info does not exist; the change is in bbsConfig.info.txt.' };
    }

    try {
      writeInfoFile(infoFile);
console.log('[BBSConfig] Saved configuration to bbsConfig.info');
      return { textFileWritten: true, infoFileWritten: true };
    } catch (error) {
      if (error instanceof InfoFileWriteError) {
        // The icon's tooltype array is not in the standard layout, so it was
        // only readable heuristically and cannot be re-serialised without
        // risking the file. The change is not lost - it is in the text
        // companion, which is the file this BBS reads - but the icon now
        // disagrees with it, and only re-creating the icon fixes that.
        const warning =
          'bbsConfig.info has a non-standard tooltype layout and was left untouched. ' +
          'The change is saved in bbsConfig.info.txt, which this BBS reads, but the ' +
          'icon file no longer matches it. Re-create the icon to bring them back together.';
console.warn(`[BBSConfig] ${warning}`);
        return { textFileWritten: true, infoFileWritten: false, warning };
      }
      throw error;
    }
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
    hold_access_level: 201, // express.e:346 - Default security level for HOLD directory access
    capitalize_filenames: false, // express.e:19253 - Convert uploaded filenames to uppercase
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
    sysop_debug_enabled: false,
  };
}

/**
 * Sensitive tooltype names that should be stripped from .info files
 * These map to fields that contain passwords, API keys, etc.
 */
const SENSITIVE_TOOLTYPES = [
  'SMTP_PASSWORD',
  'SMTP_USERNAME', // Can contain auth tokens
  'SENDGRID_API_KEY',
  'REGKEY',
  'FTP_PASSWORD',
  'API_KEY',
  'DISCORD_WEBHOOK_URL',
  'RENDER_DEPLOY_HOOK_URL',
] as const;

/**
 * Strip sensitive tooltypes from bbsConfig.info file
 * Creates a backup before modification
 *
 * @param bbsRoot - Root directory containing bbsConfig.info
 * @returns Object with strippedCount and backupPath
 */
export function stripSecretsFromConfigFile(bbsRoot: string): {
  success: boolean;
  strippedCount: number;
  backupPath?: string;
  error?: string;
} {
  const configPath = path.join(bbsRoot, 'bbsConfig.info');
  const configTextPath = configPath + '.txt';
  const backupTime = getSystemTime().toISOString().replace(/[:.]/g, '-');

  let strippedCount = 0;

  try {
    // Process binary .info file
    if (fs.existsSync(configPath)) {
      const backupPath = `${configPath}.pre-strip-${backupTime}.backup`;
      fs.copyFileSync(configPath, backupPath);
console.log(`[BBSConfig] Created backup: ${backupPath}`);

      const infoFile = parseInfoFile(configPath);
      if (infoFile) {
        for (const sensitiveKey of SENSITIVE_TOOLTYPES) {
          const index = infoFile.tooltypes.findIndex(
            tt => tt.key.toUpperCase() === sensitiveKey
          );
          if (index !== -1) {
            infoFile.tooltypes.splice(index, 1);
            strippedCount++;
console.log(`[BBSConfig] Stripped ${sensitiveKey} from bbsConfig.info`);
          }
        }
        writeInfoFile(infoFile);
      }
    }

    // Process text overlay file
    if (fs.existsSync(configTextPath)) {
      const backupPath = `${configTextPath}.pre-strip-${backupTime}.backup`;
      fs.copyFileSync(configTextPath, backupPath);

      let content = fs.readFileSync(configTextPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const filteredLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const eqIdx = trimmed.indexOf('=');
        const key = eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx).trim();
        const upperKey = key.toUpperCase();

        // Check if this is a sensitive tooltype
        const isSensitive = SENSITIVE_TOOLTYPES.some(st => upperKey === st) ||
          isSensitiveField(key.toLowerCase().replace(/_/g, '_'));

        if (isSensitive && trimmed) {
          strippedCount++;
console.log(`[BBSConfig] Stripped ${key} from bbsConfig.info.txt`);
          // Add comment indicating field was moved to database
          filteredLines.push(`; ${key}=<MOVED TO DATABASE - ENCRYPTED>`);
        } else {
          filteredLines.push(line);
        }
      }

      fs.writeFileSync(configTextPath, filteredLines.join('\n'), 'utf-8');
    }

    return {
      success: true,
      strippedCount,
      backupPath: `${configPath}.pre-strip-${backupTime}.backup`,
    };
  } catch (error: any) {
console.error('[BBSConfig] Failed to strip secrets:', error);
    return {
      success: false,
      strippedCount,
      error: error.message,
    };
  }
}
