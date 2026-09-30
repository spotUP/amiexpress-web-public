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
import { SystemConfigSchema } from './config.schemas';

export interface BBSConfigData {
  // EXECUTE_ON_* hooks - a command the board runs when something happens.
  /** Run when a caller finishes logging on (EXECUTE_ON_LOGON). */
  execute_on_logon?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_LOGON). */
  execute_async_on_logon?: string;
  /** Run when a caller logs off (EXECUTE_ON_LOGOFF). */
  execute_on_logoff?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_LOGOFF). */
  execute_async_on_logoff?: string;
  /** Run when a new account is created (EXECUTE_ON_NEW_USER). */
  execute_on_new_user?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_NEW_USER). */
  execute_async_on_new_user?: string;
  /** Run when a file finishes uploading (EXECUTE_ON_UPLOAD). */
  execute_on_upload?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_UPLOAD). */
  execute_async_on_upload?: string;
  /** Run when a caller connects (EXECUTE_ON_CONNECT). */
  execute_on_connect?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_CONNECT). */
  execute_async_on_connect?: string;
  /** Run when a node's status changes (EXECUTE_ON_STATUS_CHANGE). */
  execute_on_status_change?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_STATUS_CHANGE). */
  execute_async_on_status_change?: string;
  /** Run when a caller leaves a comment for the sysop (EXECUTE_ON_SYSOP_COMMENT). */
  execute_on_sysop_comment?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_SYSOP_COMMENT). */
  execute_async_on_sysop_comment?: string;
  /** Run when a caller pages the sysop (EXECUTE_ON_SYSOP_PAGE). */
  execute_on_sysop_page?: string;
  /** As above, without waiting for it (EXECUTE_ASYNC_ON_SYSOP_PAGE). */
  execute_async_on_sysop_page?: string;
  // Identity
  bbs_name?: string;
  sysop_name?: string;
  location?: string;
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
  /**
   * ACP.e:2660 - `NO_TIMEOUT` on the board's icon sets
   * `sopt.toggles[TOGGLES_NOTIMEOUT]`, which express.e:2185 reads as "never
   * time an input out on this board". Absent means off, which is the only way
   * a tooltype boolean can be written: every icon that predates the key would
   * otherwise read as having opted in.
   */
  no_timeout?: boolean;
  /**
   * ACP.e:2663 - `NO_WILDCARD_EXPANSION` on the board's icon clears
   * `sopt.toggles[TOGGLES_USEWILDCARDS]`; without it the toggle is on and a
   * `*` in a name is expanded (chooseAName's " Expand: <name> Correct ").
   */
  no_wildcard_expansion?: boolean;

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
  /**
   * How many colours the board's CALLERS have.
   *
   * AmiExpress ran on console.device, which has eight pens; sixteen needed
   * `ibmcon` and almost nobody ran it, and the Amiga had no iCE colours at
   * all (sysop, 2026-09-14). A board that wants to look like that sets this
   * to 8 and every bright code it sends is folded onto the eight - art drawn
   * in sixteen still displays, in the colours an Amiga would have shown.
   * 16, the default, changes nothing about what the board sends.
   */
  terminal_colours?: number;
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
  http_port?: number;

  // BBS Server Ports
  telnet_port?: number;
  ssh_port?: number;

  // System Behavior
  quiet_join?: boolean;
  convert_to_mb?: boolean;
  // express.e:sopt.toggles[TOGGLES_CREDITBYKB] — count UL/DL bytes in kilobytes instead of bytes
  credit_by_kb?: boolean;
  // SYS_RELATIVE_CONFS (axSetupTool/frmSettingsEdit.e:250,696 writes
  // RELATIVE_CONFERENCES). ACP.e:2698-2703 sets sopt.toggles[TOGGLES_CONFRELATIVE]
  // from it; express.e:5593,5613,8563,8572,25554 read that toggle to number
  // conferences relative to the caller's own access instead of absolutely.
  // P3-1.
  relative_confs?: boolean;
  // SYS_DEFAULT_MENU (express.e:31823-31824 DEFAULT_MENUNAME, falls back to
  // 'MENU' when blank/absent). The fallback screen name used for SCREEN_MENU
  // when no per-conference/~SM_ override is active (express.e:6558-6562).
  // P3-3.
  default_menu?: string;
  // SYS_DONT_SAVE_STATE (ACP.e:3091-3093 NO_SAVESTATE tooltype on the ACP
  // icon; axSetupTool/helpText.e:265 "Do not save the last callers,
  // uploads, downloads information."). On real AmiExpress this gates a
  // SEPARATE process's (ACP.e, the sysop console) acp.dat cache of the
  // last 5 callers/uploads/downloads per node (ACP.e:3404 loadState,
  // :3457 saveState) - express.e's own CallersLog write is never gated by
  // it. This port has no separate ACP process or acp.dat; the
  // caller/upload/download history it DOES persist to disk is
  // CallersLogManager's Node{n}/CallersLog, so the toggle is honoured
  // there instead: when set, the three categories the tooltype names
  // (callers, uploads, downloads) are not written. P3-2.
  dont_save_state?: boolean;

  // Logging
  debug_mode?: boolean;
  log_level?: string;
  log_retention_days?: number;
  sysop_debug_enabled?: boolean;

  // AREXX engine override — 'auto' (default), 'native', 'ts'.
  // 'auto' picks native when System/RexxMast is present, TS otherwise.
  arexx_engine?: string;

  // Mail notifications to the sysop. express.e:6716 tests these with
  // checkToolTypeExists, so the tooltype's presence is the value.
  mail_on_logon?: boolean;
  mail_on_logoff?: boolean;
  mail_on_new_user?: boolean;
  mail_on_upload?: boolean;
  mail_on_sysop_page?: boolean;
  mail_on_sysop_comment?: boolean;
  mail_on_pwd_fail?: boolean;

  // Auto-validation. express.e:29677 (AUTOVAL_DELAY), :29687 (AUTOVAL_PRESET)
  // and :30063 (AUTOVAL_PASSWORD) read all three from bbsConfig.info, falling
  // back to it when the node's own icon does not carry them.
  autoval_delay?: number;
  autoval_preset?: string;
  autoval_password?: string;
  /**
   * ACP.e:2632 reads NEWUSER_PASSWORD into `cmds.newUserPw`, and
   * express.e:30013 asks for it before a new account can be created - the
   * board's "by application" setting. Empty means anyone may register.
   */
  new_user_password?: string;
  /**
   * `sz -L` - the ZMODEM subpacket cap, in bytes.
   *
   * The DEFAULT IS 1024 AND THAT IS NOT lrzsz's: lrzsz would use 8192, and
   * this board dropped to 1024 because MuffinTerm's receive buffer overflowed
   * at about 30KB with 8K subpackets. It is a knob rather than a constant
   * because a board whose callers all run SyncTerm or NetRunner can have the
   * throughput back, and because the next client to need a different number
   * should cost a tooltype and not a deploy.
   */
  zmodem_packetlen?: number;
  /**
   * `TIMEOUT_LC` (express.e:31826): is an input timeout a DROPPED CALL?
   *
   * With it set, express marks `lostCarrier` when a caller times out at the
   * menu (express.e:28607, :28626), and the logoff line then reads
   * `Off Loss Carrier` instead of `Off Normally` (express.e:8163-8166). It is
   * how a sysop tells "he walked away" from "his modem gave up" when reading
   * the CallersLog back.
   */
  timeout_lc?: boolean;
  /**
   * `REGKEY` (express.e:31991) - the name this board is registered to, printed
   * by `VER` ("Registered to \s.", :25696) and in express's connect banner
   * (:29516).
   *
   * express defaults it to `NONE`, meaning an unregistered copy of shareware.
   * That does not apply here and would make every board's VER line read
   * `Registered to NONE.`, so the default stays the line this port has always
   * printed and the tooltype overrides it.
   */
  reg_key?: string;

  // Accounts and uploads
  auto_deactivate_days?: number;
  local_upload_path?: string;
  // express.e:19258 and :19567 — the command run to pull FILE_ID.DIZ out of
  // an archive.
  filediz_syscmd?: string;
  // express.e:348 defaults it to 15; :17720 and :19290 tell the caller how
  // many description lines they have.
  max_desclines?: number;
}

/**
 * Fields the admin offers as a fixed list of lowercase values.
 *
 * A <select> whose value matches none of its options renders as though the
 * first option were chosen while actually holding nothing - so a board with
 * NEW_USER_PROTOCOL=ZMODEM looked like it had ZMODEM selected and had no
 * value at all, and the same for PASSWORD_SECURITY. The case a sysop's Amiga
 * wrote is not something the form should have to match, so it is normalised
 * on the way in.
 */
const LOWERCASE_VALUE_FIELDS = new Set<string>([
  'new_user_protocol',
  'log_level',
  'arexx_engine',
]);

/**
 * The same idea, for values express.e spells in CAPITALS.
 *
 * PASSWORD_SECURITY is compared against LEGACY / PBKDF2_5 / PBKDF2_50 /
 * PBKDF2_100 / PBKDF2_1000 / PBKDF2_10000 (express.e:938-952), so those are
 * the spellings that go in the file and the options the form offers.
 */
const UPPERCASE_VALUE_FIELDS = new Set<string>([
  'password_security',
]);

/**
 * The six values express.e:938-952 tests PASSWORD_SECURITY against.
 *
 * It compares the tooltype to each in turn and falls through to PWD_LEGACY
 * for anything else (express.e:951), so a board whose file says `bcrypt` -
 * which is what this admin used to offer - is running LEGACY hashing right
 * now. Reading it back as LEGACY is not a rewrite of the sysop's value; it is
 * the value, as the BBS resolves it. Without this the form would show a
 * setting the board does not have, and the first save of that field would be
 * rejected by its own schema.
 */
const PASSWORD_SECURITY_VALUES = new Set<string>([
  'LEGACY', 'PBKDF2_5', 'PBKDF2_50', 'PBKDF2_100', 'PBKDF2_1000', 'PBKDF2_10000',
]);

/**
 * The case a field's value is read back in.
 *
 * A <select> whose value matches none of its options renders as though the
 * first were chosen while holding nothing, so the case a sysop's Amiga wrote
 * must not be something the form has to match. Exported because the
 * round-trip sweep has to apply the same rule rather than keep its own copy
 * of the two lists.
 */
export function normalizeConfigValueCase(field: string, value: string): string {
  if (LOWERCASE_VALUE_FIELDS.has(field)) return value.toLowerCase();
  if (UPPERCASE_VALUE_FIELDS.has(field)) {
    const upper = value.toUpperCase();
    if (field === 'password_security' && !PASSWORD_SECURITY_VALUES.has(upper)) {
      // express.e:951 - anything it does not recognise IS legacy.
      return 'LEGACY';
    }
    return upper;
  }
  return value;
}

/**
 * Tooltype name mapping (AmiExpress format → internal field name)
 */
const TOOLTYPE_MAP: Record<string, keyof BBSConfigData> = {
  // The EXECUTE_ON_* / EXECUTE_ASYNC_ON_* hooks (express.e:6666-6744).
  // batch-scheduler.ts has always run these; nothing could set them, so a
  // sysop had to write them into bbsConfig.info by hand. Listed here so they
  // travel through the same reader, writer and schema as every other setting.
  'EXECUTE_ON_LOGON': 'execute_on_logon',
  'EXECUTE_ASYNC_ON_LOGON': 'execute_async_on_logon',
  'EXECUTE_ON_LOGOFF': 'execute_on_logoff',
  'EXECUTE_ASYNC_ON_LOGOFF': 'execute_async_on_logoff',
  'EXECUTE_ON_NEW_USER': 'execute_on_new_user',
  'EXECUTE_ASYNC_ON_NEW_USER': 'execute_async_on_new_user',
  'EXECUTE_ON_UPLOAD': 'execute_on_upload',
  'EXECUTE_ASYNC_ON_UPLOAD': 'execute_async_on_upload',
  'EXECUTE_ON_CONNECT': 'execute_on_connect',
  'EXECUTE_ASYNC_ON_CONNECT': 'execute_async_on_connect',
  'EXECUTE_ON_STATUS_CHANGE': 'execute_on_status_change',
  'EXECUTE_ASYNC_ON_STATUS_CHANGE': 'execute_async_on_status_change',
  'EXECUTE_ON_SYSOP_COMMENT': 'execute_on_sysop_comment',
  'EXECUTE_ASYNC_ON_SYSOP_COMMENT': 'execute_async_on_sysop_comment',
  'EXECUTE_ON_SYSOP_PAGE': 'execute_on_sysop_page',
  'EXECUTE_ASYNC_ON_SYSOP_PAGE': 'execute_async_on_sysop_page',
  // Identity
  'BBS_NAME': 'bbs_name',
  'SYSOP_NAME': 'sysop_name',
  'LOCATION': 'location',
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
  'NO_TIMEOUT': 'no_timeout',                       // ACP.e:2660 express.e:2185
  'NO_WILDCARD_EXPANSION': 'no_wildcard_expansion', // ACP.e:2663

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
  'TERMINAL_COLOURS': 'terminal_colours',
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
  // LVL_CAPITOLS_in_FILE is an ARRAY INDEX (axcommon.e:53), not a tooltype.
  // The real one is CAPITOL_FILES and it lives in the NODE icon
  // (ACP.e:2651), where the Nodes page already edits it - so this setting has
  // no place in bbsConfig.info at all.

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
  // Stored as its NEGATIVE - see INVERTED_BOOLEAN_TOOLTYPES.
  'HTTP_DISABLED': 'http_enabled',
  // HTTP_HOST was never a bbsConfig tooltype. express.e:15002 reads HTTPHOST
  // out of the PROTOCOL icon (TOOLTYPE_XFERLIB), per protocol, which is the
  // Protocols page's business and cannot be one board-wide field.
  // express.e:15707, and the node icon at :15708. Kept so a board carried back
  // to a real Amiga keeps the setting - NOT because anything here binds it.
  // HTTPPORT is the port of express's HTTP TRANSFER protocol (httpd.e:558): a
  // one-shot server opened for a single download or upload by a caller whose
  // xferProtocol is HTTP, and closed on Ctrl-C or carrier loss. This port does
  // not implement that protocol - it serves files over its own always-on
  // endpoints instead (handlers/file/file-delivery.ts:194), the same call the
  // parity plan's scope decision 4 records. An empty HTTPPORT means 20000+node
  // to express, so the field is left blank rather than defaulted.
  'HTTPPORT': 'http_port',

  // BBS Server Ports
  'TELNET_PORT': 'telnet_port',
  'SSH_PORT': 'ssh_port',

  // System Behavior
  'QUIET_JOIN': 'quiet_join',
  'CONVERT_TO_MB': 'convert_to_mb',
  // express.e sopt.toggles[TOGGLES_CREDITBYKB] — counts UL/DL in KB instead of bytes
  'CREDIT_BY_KBYTES': 'credit_by_kb',  // ACP.e:3030 - CREDITBYKB is an index (axcommon.e:385)
  // ACP.e:2698 sets sopt.toggles[TOGGLES_CONFRELATIVE] from this key on the
  // CONFCONFIG icon; axSetupTool writes the same key name to bbsConfig.info
  // (frmSettingsEdit.e:696) so it is read from the one config file this port
  // keeps. P3-1.
  'RELATIVE_CONFERENCES': 'relative_confs',
  // express.e:31823 DEFAULT_MENUNAME. P3-3.
  'DEFAULT_MENUNAME': 'default_menu',
  // ACP.e:3092 NO_SAVESTATE (on the ACP icon in real AmiExpress; this port
  // keeps every system tooltype in bbsConfig.info instead - see the field
  // comment above). P3-2.
  'NO_SAVESTATE': 'dont_save_state',

  // Logging
  'DEBUG_MODE': 'debug_mode',
  'LOG_LEVEL': 'log_level',
  'LOG_RETENTION_DAYS': 'log_retention_days',
  'SYSOP_DEBUG_OUTPUT': 'sysop_debug_enabled',
  'AREXX_ENGINE': 'arexx_engine',

  // Mail notifications — express.e:6716 reads MAIL_ON_LOGON with
  // checkToolTypeExists, so these are presence flags.
  'MAIL_ON_LOGON': 'mail_on_logon',
  'MAIL_ON_LOGOFF': 'mail_on_logoff',
  'MAIL_ON_NEW_USER': 'mail_on_new_user',
  'MAIL_ON_UPLOAD': 'mail_on_upload',
  'MAIL_ON_SYSOP_PAGE': 'mail_on_sysop_page',
  'MAIL_ON_SYSOP_COMMENT': 'mail_on_sysop_comment',
  'MAIL_ON_PWD_FAIL': 'mail_on_pwd_fail',

  // Auto-validation — express.e:29677, :29687, :30063
  'AUTOVAL_DELAY': 'autoval_delay',
  'AUTOVAL_PRESET': 'autoval_preset',
  'AUTOVAL_PASSWORD': 'autoval_password',
  'NEWUSER_PASSWORD': 'new_user_password',           // ACP.e:2632 express.e:30013
  'ZMODEM_PACKETLEN': 'zmodem_packetlen',            // sz -L, this port's own knob
  'TIMEOUT_LC': 'timeout_lc',                        // express.e:31826
  'REGKEY': 'reg_key',                               // express.e:31991

  // Accounts, uploads and file descriptions
  'AUTO_DEACTIVATE_DAYS': 'auto_deactivate_days',
  'LOCAL_UPLOAD_PATH': 'local_upload_path',
  'FILEDIZ_SYSCMD': 'filediz_syscmd',   // express.e:19258, :19567
  'MAX_DESCLINES': 'max_desclines',     // express.e:348
};

/**
 * Boolean tooltypes stored as their NEGATIVE.
 *
 * A tooltype means what AmiExpress means by it: present is on, absent is off.
 * That cannot express a flag whose default is ON, because turning it off
 * REMOVES the key and the next read cannot tell "switched off" from "this
 * board's file predates the field". `http_enabled` is exactly that flag: it
 * gates the web terminal, every existing board's file was written before it
 * meant anything, and defaulting absent-to-off would have taken every one of
 * them off the web on upgrade. A startup migration that added the key would
 * have re-added it every boot after the sysop switched it off.
 *
 * Storing the negative removes the problem instead of guarding it. Absent -
 * every board today - is ON. The key is only ever written when the sysop
 * asks for the non-default state, which is what presence semantics are for.
 *
 * The negation lives here, at the tooltype boundary, and nowhere else: the
 * schema, the column, the API and the admin checkbox all still speak
 * `http_enabled`.
 *
 * A board carrying the old `HTTP_ENABLED` key is unaffected - it is no longer
 * a known tooltype, so it is preserved untouched and read by nothing.
 */
const INVERTED_BOOLEAN_TOOLTYPES = new Set(['HTTP_DISABLED']);

function isInvertedTooltype(tooltypeName: string): boolean {
  return INVERTED_BOOLEAN_TOOLTYPES.has(tooltypeName);
}

/** Whether this FIELD is stored as its negative. */
function isInvertedField(fieldName: string): boolean {
  const tooltypeName = REVERSE_TOOLTYPE_MAP[fieldName];
  return tooltypeName !== undefined && isInvertedTooltype(tooltypeName);
}

/**
 * What TYPE a configuration field is, according to the schema that validates it.
 *
 * The reader used to answer this question with `typeof getDefaultConfig()[f]`,
 * which makes a field's type a side effect of whether somebody gave it a
 * default. Every field that has one reads the same as before - the default is
 * still asked first - but a field with NO default used to come back as a
 * string, silently, whatever the schema and the column said. `http_port` is
 * the first such field and the reason this exists: its default was removed
 * because express computes 20000+node for an empty HTTPPORT (express.e:15713)
 * and no board-wide default can say that.
 *
 * `SystemConfigSchema` is the same object the API validates writes against, so
 * this adds no second opinion about what a field is.
 */
export type DeclaredFieldType = 'boolean' | 'number' | 'string' | undefined;

export function declaredFieldType(fieldName: string): DeclaredFieldType {
  const shape = SystemConfigSchema.shape as Record<string, unknown>;
  let node: any = shape[fieldName];

  // Unwrap the wrappers a field may be declared through - `.optional()`,
  // `.default()`, `.nullable()` - until the base type is reached. Bounded, so
  // a schema shape this does not understand cannot spin.
  for (let depth = 0; node && depth < 8; depth++) {
    const typeName = node?._def?.typeName;
    if (typeName === 'ZodBoolean') return 'boolean';
    if (typeName === 'ZodNumber') return 'number';
    if (typeName === 'ZodString' || typeName === 'ZodEnum' || typeName === 'ZodLiteral') return 'string';
    // A union (`z.string().or(z.literal(''))`) is only ever string-shaped here.
    if (typeName === 'ZodUnion') return 'string';
    node = node?._def?.innerType ?? node?._def?.schema;
  }

  return undefined;
}

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
  if (CANONICAL_TOOLTYPE_KEY[stripped]) {
    return CANONICAL_TOOLTYPE_KEY[stripped];
  }

  // A digit is alphanumeric, so the strip above leaves a length byte that
  // happened to print as one glued to the front of the key. bbsConfig.info
  // carries "6FTPDATAPORT=50101,..." that way - 0x36 is the entry's own
  // length - and the port list has never reached the config because of it.
  // Only accepted when what remains is a tooltype this BBS knows, so a key
  // that genuinely starts with a digit is left alone.
  const digitsStripped = upper.replace(/^[0-9]+(?=[A-Z])/, '');
  return CANONICAL_TOOLTYPE_KEY[digitsStripped] ?? upper;
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
        // First wins, as in the icon: this file carries FTPDATAPORT twice,
        // once with the sysop's port list and once as a bare flag further
        // down, and the flag used to overwrite the list with nothing.
        if (toolTypes.has(keyOnly)) continue;
        toolTypes.set(keyOnly, '');
        continue;
      }

      const rawKey = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (!rawKey) continue;

      const key = normalizeTooltypeKey(rawKey);
      if (!TOOLTYPE_MAP[key]) continue;
      if (toolTypes.has(key)) continue;

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
 * Keys the icon and the text companion do not agree on.
 *
 * Only keys BOTH files carry: a key absent from one is a boolean the sysop
 * switched off, which is the presence semantics the loader already handles,
 * not a disagreement.
 */
export function disagreeingKeys(
  icon: Map<string, string>,
  text: Map<string, string>,
): string[] {
  const out: string[] = [];
  for (const [key, value] of icon.entries()) {
    if (!text.has(key)) continue;
    if (text.get(key) !== value) out.push(key);
  }
  return out.sort();
}

/**
 * Load system configuration from bbsConfig.info
 */
export function loadBBSConfig(bbsRoot: string): BBSConfigData {
  const configPath = path.join(bbsRoot, 'bbsConfig.info');
  const configTextPath = configPath + '.txt';

  const mergedToolTypes = new Map<string, string>();
  /** What the ICON said, kept only to report where it disagrees with the companion. */
  const iconToolTypes = new Map<string, string>();

  if (fs.existsSync(configPath)) {
    try {
      const buffer = fs.readFileSync(configPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);
      for (const [rawKey, rawValue] of parsed.toolTypes.entries()) {
        const key = normalizeTooltypeKey(rawKey);
        // FindToolType answers with the first match (tooltypes.e:215-218), and
        // this file repeats keys: FTPDATAPORT appears as "6FTPDATAPORT=50101,
        // ..." and again as a bare flag. Overwriting left the flag's empty
        // value, so the ports the sysop configured read as unset.
        if (mergedToolTypes.has(key)) continue;
        mergedToolTypes.set(key, rawValue);
      }
      for (const [key, value] of mergedToolTypes.entries()) iconToolTypes.set(key, value);
console.log('[BBSConfig] Loaded configuration from bbsConfig.info');
    } catch (error) {
console.error('[BBSConfig] Failed to read bbsConfig.info:', error);
    }
  }

  if (fs.existsSync(configTextPath)) {
    const textToolTypes = parseTooltypesTextFile(configTextPath);

    // Both files are complete snapshots - the writer builds the text companion
    // from the whole merged tooltype set - so one of them is the truth and the
    // other is stale, not a partial override.
    //
    // Merging the text file over the icon looked equivalent and was not: a
    // boolean tooltype is expressed by its PRESENCE, so switching one off
    // removes it from the text file, and a merge then read it straight back
    // out of the icon. Turning any flag off silently did nothing on a board
    // whose icon the writer cannot update.
    //
    // THE COMPANION WINS, and it is not a question of which file is newer.
    // saveBBSConfig writes the companion FIRST and always, then attempts the
    // icon - and the icon attempt is allowed to fail: an icon whose tooltype
    // array is not in the standard layout is left untouched by design, with a
    // warning that says "the icon file no longer matches it". Ordering by
    // mtime therefore let the icon's stale bytes outrank the sysop's own save
    // whenever the icon write DID land, milliseconds later, carrying values
    // the update could not reach.
    //
    // The live board 2026-09-07: the companion said SMTP_PORT=587, the icon
    // said 465 with SMTP_HOST listed twice and length bytes baked into three
    // keys. 465 is not reachable from that host, so the achievements mail hung
    // and the drain died - and the effective port changed between two runs
    // minutes apart, because it was decided by a millisecond.
    mergedToolTypes.clear();
    for (const [key, value] of textToolTypes.entries()) {
      mergedToolTypes.set(key, value);
    }
console.log('[BBSConfig] Loaded configuration from bbsConfig.info.txt');

    // A disagreement is worth saying out loud. It was silent before, and the
    // only symptom was a setting that would not stick.
    const disagreements = disagreeingKeys(iconToolTypes, textToolTypes);
    if (disagreements.length > 0) {
console.warn(
        `[BBSConfig] bbsConfig.info disagrees with the companion on ${disagreements.length} key(s) ` +
        `and the companion wins: ${disagreements.slice(0, 8).join(', ')}` +
        `${disagreements.length > 8 ? ', ...' : ''}. Re-create the icon to bring them back together.`
      );
    }
  }

  // "No configuration at all" and "a configuration that switches everything
  // off" are different answers, and testing the tooltype count could not tell
  // them apart. A board whose only file is the text companion - one with no
  // icon, which is every board before its first icon is written - turned the
  // last flag off, wrote an empty companion, and read the defaults straight
  // back: the flag came back on and could not be cleared at all.
  if (!fs.existsSync(configPath) && !fs.existsSync(configTextPath)) {
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
        // A field stored as its negative starts ON: absent means the sysop
        // never asked for the non-default state.
        (config as any)[field] = isInvertedField(field);
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

      // Parse value based on field type.
      //
      // The DEFAULT answers first, because that is what every field here has
      // always been read through. The SCHEMA answers for a field that has no
      // default: `typeof undefined` is neither 'boolean' nor 'number', so such
      // a field used to fall through to the string branch and a sysop's
      // HTTPPORT=20001 came back as the string '20001' against a column and a
      // form that both say number.
      const declared = declaredFieldType(fieldName);
      const fromDefault = typeof getDefaultConfig()[fieldName];

      if (fromDefault === 'boolean' || (fromDefault === 'undefined' && declared === 'boolean')) {
        // Boolean flag: presence = true, or = FALSE for the handful stored
        // as their negative.
        (config as any)[fieldName] = !isInvertedTooltype(key);
      } else if (fromDefault === 'number' || (fromDefault === 'undefined' && declared === 'number')) {
        // Numeric value
        const num = parseInt(rawValue, 10);
        if (!isNaN(num)) {
          (config as any)[fieldName] = num;
        }
      } else {
        (config as any)[fieldName] = normalizeConfigValueCase(fieldName, rawValue);
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
        // First wins here too - otherwise the next save writes the later,
        // emptier duplicate back over the value it should have kept.
        if (TOOLTYPE_MAP[key]) {
          if (!existing.has(key)) existing.set(key, rawValue);
        } else if (!existing.has(rawKey.toUpperCase())) {
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
        // Boolean: present = true, absent = false - inverted for the handful
        // stored as their negative, where the key is written to switch OFF.
        const present = isInvertedTooltype(tooltypeName) ? !value : value;
        if (present) {
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
    invalidateBoardConfig();
console.log('[BBSConfig] Saved configuration to bbsConfig.info.txt');

    if (!infoFile) {
console.warn('[BBSConfig] bbsConfig.info not found; wrote bbsConfig.info.txt only');
      return { textFileWritten: true, infoFileWritten: false, warning: 'bbsConfig.info does not exist; the change is in bbsConfig.info.txt.' };
    }

    // Heal keys with a length byte baked into them before the icon is
    // rewritten. The text companion has always done this; the icon could not
    // be written at all until now, so it still carries what the old heuristic
    // read - "6FTPDATAPORT" for the key this board spells FTPDATAPORT, the
    // 0x36 being the entry's own length. Writing that back would make the two
    // files disagree permanently, and a real Amiga's FindToolType would go on
    // missing the key.
    for (const tooltype of infoFile.tooltypes) {
      const cleanKey = cleanTooltypeKey(tooltype.key);
      if (cleanKey && cleanKey !== tooltype.key) {
        tooltype.key = cleanKey;
        tooltype.originalLine = '';
      }
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
 * The board's configuration, read from the file the BBS reads.
 *
 * Six runtime consumers - the password policy, the login post-check, new user
 * defaults, the auth socket, the screen handler and the node manager - each
 * asked the DATABASE for values the admin writes to disk. A sysop changing
 * the minimum password length saw the form save it and the board carry on
 * with the old one, because the writer and the reader were using different
 * stores. This is the single place to ask.
 *
 * Cached, because the password policy is consulted on every login and this
 * parses an Amiga icon; invalidated by saveBBSConfig, so a change made a
 * moment ago is visible immediately.
 */
let boardConfigCache: { root: string; stamp: string; config: BBSConfigData } | null = null;

/**
 * When the two files were last written, cheaply.
 *
 * The cache cannot rely on saveBBSConfig being the only writer - a restore, a
 * hand edit, or another process would all leave a stale value being served,
 * which is the same "reader and writer disagree" bug this accessor exists to
 * end. Comparing mtime and size is two stats, against parsing an Amiga icon.
 */
function configStamp(bbsRoot: string): string {
  const parts: string[] = [];
  for (const name of ['bbsConfig.info', 'bbsConfig.info.txt']) {
    try {
      const stats = fs.statSync(path.join(bbsRoot, name));
      parts.push(`${name}:${stats.mtimeMs}:${stats.size}`);
    } catch {
      parts.push(`${name}:-`);
    }
  }
  return parts.join('|');
}

export function getBoardConfig(bbsRoot: string): BBSConfigData {
  const stamp = configStamp(bbsRoot);
  if (boardConfigCache && boardConfigCache.root === bbsRoot && boardConfigCache.stamp === stamp) {
    return boardConfigCache.config;
  }
  const config = loadBBSConfig(bbsRoot);
  boardConfigCache = { root: bbsRoot, stamp, config };
  return config;
}

/** Drop the cache. Called whenever the configuration is written. */
export function invalidateBoardConfig(): void {
  boardConfigCache = null;
}

/**
 * Get default configuration values
 */
function getDefaultConfig(): BBSConfigData {
  return {
    bbs_name: 'AmiExpress BBS',
    sysop_name: 'Sysop',
    location: '',
    email: '',
    website: '',
    min_password_length: 8,
    // Without a default, loadBBSConfig has no `typeof` to infer the field's
    // type from and returns the tooltype as a STRING, while
    // login-post.service.ts:351 tests for a number - so expiry never applied.
    // The same is true of every field below: a boolean with no default comes
    // back as '' or '1' and no form checkbox can show it.
    password_expiry_days: 0,
    system_password: '',
    credit_by_kb: false,
    arexx_engine: 'auto',
    min_password_strength: 0,
    max_password_fails: -1,
    // What a board with NO PASSWORD_SECURITY tooltype actually does:
    // express.e:951 falls through to PWD_LEGACY. Showing 'bcrypt' claimed a
    // hashing mode AmiExpress has never had.
    password_security: 'LEGACY',
    strict_password_policy: false,
    auto_validate: false,
    confirm_deletions: true,
    default_time_limit: -1,
    max_session_time: -1,
    idle_timeout: 10,
    no_timeout: false,
    no_wildcard_expansion: false,
    new_user_sec_level: 30,
    new_user_time_limit: -1,
    new_user_chat_limit: -1,
    new_user_lines_per_screen: 23,
    new_user_expert: false,
    new_user_ansi: true,
    new_user_protocol: 'zmodem',
    new_user_screen_type: 'ANSI',
    new_user_editor: 'FULL',
    new_user_conf_access: 'XXX',
    new_user_available_chat: true,
    new_user_quiet_node: false,
    new_user_auto_rejoin: true,
    ansi_enabled: true,
    // Sixteen: what a web or telnet caller has, and what the board has always
    // sent. A sysop who wants the Amiga's eight sets TERMINAL_COLOURS=8.
    terminal_colours: 16,
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
    // A board with no configuration file yet serves its web terminal. The
    // switch exists to turn it off, and a default of false meant a fresh
    // install came up dark on the web with no clue why.
    http_enabled: true,
    // http_port has NO default on purpose. Its tooltype is express's HTTPPORT,
    // and express.e:15713 says an empty HTTPPORT means 20000+node - a value no
    // board-wide field can hold, and never 80. Writing 80 here put a key in
    // every board's file that said something express does not mean. Absent is
    // the honest state, and the writer skips undefined.
    telnet_port: 2323,
    ssh_port: 2222,
    quiet_join: false,
    convert_to_mb: false,
    // ACP.e:2698-2703 - absent means absolute conference numbering.
    relative_confs: false,
    // ACP.e:3091 persistState:=TRUE by default; the tooltype only ever
    // turns saving OFF, never on, so absent means "do save" like real
    // AmiExpress.
    dont_save_state: false,
    debug_mode: false,
    log_level: 'info',
    log_retention_days: 90,
    sysop_debug_enabled: false,

    // These defaults are also what tells the parser a field's type: a
    // tooltype is read as a flag, a number or a string according to the
    // typeof its default here.
    mail_on_logon: false,
    mail_on_logoff: false,
    mail_on_new_user: false,
    mail_on_upload: false,
    mail_on_sysop_page: false,
    mail_on_sysop_comment: false,
    mail_on_pwd_fail: false,
    autoval_delay: 0,
    autoval_preset: '',
    autoval_password: '',
    new_user_password: '',
    zmodem_packetlen: 1024,
    timeout_lc: false,
    reg_key: '',
    auto_deactivate_days: 0,
    local_upload_path: '',
    filediz_syscmd: '',
    max_desclines: 15,   // express.e:348 — DEF max_desclines=15
    // express.e:31824 - blank/absent falls back to 'MENU' at the read site
    // (menu.ts), matching StrLen(defaultMenuName)=0 THEN StrCopy(...,'MENU').
    default_menu: '',
  };
}

/**
 * Sensitive tooltype names that should be stripped from .info files
 * These map to fields that contain passwords, API keys, etc.
 */
const SENSITIVE_TOOLTYPES = [
  'SMTP_PASSWORD',
  // SMTP_USERNAME is NOT stripped: express.e:31810 reads it out of this file.
  'SENDGRID_API_KEY',
  // REGKEY was here AND in secrets-encryption's not-a-secret list, which
  // stripped from bbsConfig.info the one file express.e:31991 reads it
  // from. It is not a secret - it is the name VER prints - so it stays out
  // of this list and lives where the board put it.
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
