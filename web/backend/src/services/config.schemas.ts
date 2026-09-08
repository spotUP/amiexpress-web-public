/**
 * Configuration Zod Validation Schemas
 *
 * Extracted from config.service.ts for better maintainability.
 * All Zod schemas for configuration validation.
 */

import { z } from 'zod';
import { DOOR_TYPES, DOOR_RUNTIME_ENVS } from '../constants/door-types';

// ===== Zod Validation Schemas =====

export const SystemConfigSchema = z.object({
  // Identity
  bbs_name: z.string().min(1).max(100).optional(),
  sysop_name: z.string().min(1).max(100).optional(),
  location: z.string().max(200).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  website: z.string().url().max(200).optional().or(z.literal('')),

  // Security & Authentication
  min_password_length: z.number().int().min(0).max(32).optional(),
  min_password_strength: z.number().int().min(0).max(4).optional(),
  max_password_fails: z.number().int().min(-1).optional(),
  // The six values express.e:938-952 actually tests for. It compares the
  // tooltype against these literals and falls through to PWD_LEGACY for
  // anything else - so bcrypt, sha256 and md5 all quietly degraded the board
  // to legacy hashing while the admin reported bcrypt.
  //
  // Upper-cased rather than lower: these are express.e's own spellings, so
  // they are right whether icon.library's MatchToolValue folds case or not.
  password_security: z.string().transform(v => v?.toUpperCase()).pipe(
    z.enum(['LEGACY', 'PBKDF2_5', 'PBKDF2_50', 'PBKDF2_100', 'PBKDF2_1000', 'PBKDF2_10000'])
  ).optional(),
  strict_password_policy: z.boolean().optional(),
  // express.e:29785 - 0 disables expiry. Mapped in TOOLTYPE_MAP and served by
  // the API, but absent here, so `.partial().parse()` STRIPPED it: zod drops
  // an unknown key and reports success, so the save looked fine and the value
  // never reached the writer.
  password_expiry_days: z.number().int().min(0).max(3650).optional(),
  // ACP.e:2630 - cmds.sysPass, the password the sysop types at the local
  // console. It also goes in DISK_ONLY_FIELDS: "password" in the name would
  // otherwise route it to the encrypted database while the login gate reads
  // the disk.
  system_password: z.string().max(200).optional(),
  auto_validate: z.boolean().optional(),
  confirm_deletions: z.boolean().optional(),

  // Session Settings
  default_time_limit: z.number().int().min(-1).max(1440).optional(),
  max_session_time: z.number().int().min(-1).max(1440).optional(),
  idle_timeout: z.number().int().min(1).max(60).optional(),
  // ACP.e:2660 - the board-wide switch express reads at every prompt.
  no_timeout: z.boolean().optional(),

  // New User Defaults
  new_user_sec_level: z.number().int().min(1).max(255).optional(),
  new_user_time_limit: z.number().int().min(-1).max(1440).optional(),
  new_user_chat_limit: z.number().int().min(-1).max(1440).optional(),
  new_user_lines_per_screen: z.number().int().min(10).max(100).optional(),
  new_user_expert: z.boolean().optional(),
  new_user_ansi: z.boolean().optional(),
  new_user_protocol: z.string().max(50).optional(),
  new_user_screen_type: z.string().max(50).optional(),
  new_user_editor: z.string().max(50).optional(),
  new_user_conf_access: z.string().max(50).optional(),
  new_user_available_chat: z.boolean().optional(),
  new_user_quiet_node: z.boolean().optional(),
  new_user_auto_rejoin: z.boolean().optional(),

  // Display Settings
  ansi_enabled: z.boolean().optional(),
  color_scheme: z.string().max(50).optional(),
  allow_custom_screens: z.boolean().optional(),

  // Language
  language_base: z.string().max(200).optional(),
  default_language: z.string().max(50).optional(),

  // Limits
  // Left at 256 deliberately. axobjects.e:38 declares conferenceAccess as
  // ARRAY OF CHAR [10], which would cap a board at nine - but this board runs
  // fourteen conferences today, and AmiExpress has a second path for exactly
  // that case (isConfAccessAreaName / TOOLTYPE_AREA, express.e:8505-8512).
  // Clamping to nine would break a working board on a reading of one struct.
  max_conferences: z.number().int().min(1).max(256).optional(),
  max_message_bases: z.number().int().min(1).max(1024).optional(),
  max_file_areas: z.number().int().min(1).max(1024).optional(),
  // 255, which is what THIS BBS runs: NodeStatusManager.MAX_NODES = 255, and
  // the sysop's board is configured for that many.
  //
  // The Amiga's own limit is 32 (axcommon.e:28, EXPORT CONST MAX_NODES=32) and
  // capping here on that reading was wrong twice over: it rejected every
  // System Configuration save on a field the sysop had not touched, and the
  // fix applied on 2026-08-31 was to change the BOARD's value from 255 to 32
  // rather than to question the cap. The board is not an Amiga; the 68K door
  // paths that do carry the Amiga limit enforce it themselves
  // (MulticomManager, XIM's RTW_MAX_NODES).
  max_nodes: z.number().int().min(1).max(255).optional(),

  // File Management
  // express.e:346 - the level required to reach the HOLD directory. The form
  // has a field for it AND a <TooltypeKey> badge naming the key it claims to
  // write; zod stripped it on the way through.
  hold_access_level: z.number().int().min(0).max(255).optional(),
  // Ratios counted in kilobytes rather than in files.
  credit_by_kb: z.boolean().optional(),
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
  http_port: z.number().int().min(1).max(65535).optional(),

  // BBS Server Ports
  telnet_port: z.number().int().min(1).max(65535).optional(),
  ssh_port: z.number().int().min(1).max(65535).optional(),

  // System Behavior (TOOLTYPE_BBSCONFIG)
  quiet_join: z.boolean().optional(),
  convert_to_mb: z.boolean().optional(),
  // P3-1: SYS_RELATIVE_CONFS (RELATIVE_CONFERENCES) - number conferences
  // relative to the caller's own access rather than absolutely.
  relative_confs: z.boolean().optional(),
  // P3-3: SYS_DEFAULT_MENU (DEFAULT_MENUNAME) - fallback SCREEN_MENU name;
  // blank means the express.e default of 'MENU' (express.e:31824).
  default_menu: z.string().max(100).optional(),
  // P3-2: SYS_DONT_SAVE_STATE (NO_SAVESTATE) - suppress caller/upload/
  // download history.
  dont_save_state: z.boolean().optional(),

  // Logging
  debug_mode: z.boolean().optional(),
  // Which AREXX interpreter runs a .rexx door. engine-selector.ts:41 accepts
  // these three and falls back to 'auto' for anything else.
  arexx_engine: z.string().transform(v => v?.toLowerCase()).pipe(
    z.enum(['auto', 'native', 'ts'])
  ).optional(),
  log_level: z.enum(['debug', 'info', 'warning', 'error']).optional(),
  log_retention_days: z.number().int().min(1).max(365).optional(),
  sysop_debug_enabled: z.boolean().optional(),
  // WEB_: GDPR Phase 5 — default false (PII stripped). When true, webhook
  // payloads include username, real name, location, phone, email verbatim.
  webhook_include_pii: z.boolean().optional(),

  // Push Notifications (VAPID)
  vapid_public_key: z.string().max(500).optional(),
  vapid_private_key: z.string().max(500).optional(),
  vapid_contact_email: z.string().email().max(200).optional().or(z.literal('')),
  // Achievements (SP2)
  achievements_server_url: z.string().max(500).optional(),
  achievements_board_key: z.string().max(200).optional(),
  achievements_disabled: z.boolean().optional(),

  // Mail notifications to the sysop. The form has offered these since it was
  // written; without them here zod stripped the keys before the writer saw
  // them, so the checkboxes could not be set at all.
  // express.e:6716 reads MAIL_ON_LOGON with checkToolTypeExists.
  mail_on_logon: z.boolean().optional(),
  mail_on_logoff: z.boolean().optional(),
  mail_on_new_user: z.boolean().optional(),
  mail_on_upload: z.boolean().optional(),
  mail_on_sysop_page: z.boolean().optional(),
  mail_on_sysop_comment: z.boolean().optional(),
  mail_on_pwd_fail: z.boolean().optional(),

  // Auto-validation — express.e:29677, :29687, :30063
  autoval_delay: z.number().int().min(0).optional(),
  autoval_preset: z.string().max(100).optional(),
  autoval_password: z.string().max(200).optional(),
  // ACP.e:2632 - the board's new-user password, typed by a caller, not the sysop's.
  new_user_password: z.string().max(200).optional(),
  // sz -L. 1024 is this board's MuffinTerm-safe default; 8192 is lrzsz's own.
  zmodem_packetlen: z.number().int().min(128).max(8192).optional(),
  // express.e:31826 - count an input timeout as a dropped call in the log.
  timeout_lc: z.boolean().optional(),
  // express.e:31991 - the name VER says the board is registered to.
  reg_key: z.string().max(100).optional(),

  // Accounts, uploads and file descriptions
  auto_deactivate_days: z.number().int().min(0).optional(),
  local_upload_path: z.string().max(500).optional(),
  filediz_syscmd: z.string().max(500).optional(),   // express.e:19258
  max_desclines: z.number().int().min(1).max(100).optional(),   // express.e:348

  // EXECUTE_ON_* / EXECUTE_ASYNC_ON_* (express.e:6666-6744). batch-scheduler
  // has always run these; without them here a save would drop whatever the
  // sysop typed.
  execute_on_logon: z.string().max(500).optional(),
  execute_async_on_logon: z.string().max(500).optional(),
  execute_on_logoff: z.string().max(500).optional(),
  execute_async_on_logoff: z.string().max(500).optional(),
  execute_on_new_user: z.string().max(500).optional(),
  execute_async_on_new_user: z.string().max(500).optional(),
  execute_on_upload: z.string().max(500).optional(),
  execute_async_on_upload: z.string().max(500).optional(),
  execute_on_connect: z.string().max(500).optional(),
  execute_async_on_connect: z.string().max(500).optional(),
  execute_on_status_change: z.string().max(500).optional(),
  execute_async_on_status_change: z.string().max(500).optional(),
  execute_on_sysop_comment: z.string().max(500).optional(),
  execute_async_on_sysop_comment: z.string().max(500).optional(),
  execute_on_sysop_page: z.string().max(500).optional(),
  execute_async_on_sysop_page: z.string().max(500).optional(),
});

export const NodeConfigSchema = z.object({
  // Node0 is a real node - it exists on this board and on the live one, and
  // AmiExpress numbers from zero. Requiring 1 meant the admin refused to save
  // the first node it listed.
  // Node numbers are 0-based and there are at most MAX_NODES of them -
  // 255 on this BBS, see max_nodes above. Node 0 is real: Node0.info is the
  // first node.
  node_number: z.number().int().min(0).max(254),
  // NODESTART is a multi-line block - the command, then a tooltype per line
  // (QUIETNODE, PRIORITY, CONSOLE_OUTPUT_DEVICE and the rest). A real one is
  // well past 200 characters, so the cap rejected every node that had one.
  node_start: z.string().max(4000).optional(),
  priority: z.number().int().min(-1).max(20).optional(),
  // ACP.e:2666-2673 - the node's screen directory. An Amiga path (BBS:...,
  // NODE3:...) or one relative to the board root; empty means express.e's
  // default of `<bbsLoc>/Node<N>/`.
  screens: z.string().max(200).optional(),
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
  // The other two node switches this board now honours: SHOWPWFAIL
  // (express.e:30030) and USERNUMBER_LOGIN (express.e:29598). Serving a field
  // the schema does not declare means a save silently drops it.
  show_password_fails: z.boolean().optional(),
  usernumber_login: z.boolean().optional(),
  telnet: z.boolean().optional(),
  ftp: z.boolean().optional(),
  disable_quick_logons: z.boolean().optional(),
  view_password: z.boolean().optional(),
  no_rad_boogie: z.boolean().optional(),
  nrams: z.array(z.string()).optional()
});

export const ConferenceConfigSchema = z.object({
  conference_id: z.number().int().min(1),
  // The name the API serves for every conference, and the admin's own list
  // shows. It was not declared, so zod stripped it and renaming a conference
  // did nothing at all. express.e:31852 reads it as NAME.n out of
  // ConfConfig.info - not out of Conf<N>.info.
  name: z.string().trim().min(1).max(54).optional(),
  ndirs: z.number().int().min(0).max(16).optional(),
  storagedrive_1: z.number().int().min(0).max(50).optional(),
  storagedrive_2: z.number().int().min(0).max(50).optional(),
  storagedrive_3: z.number().int().min(0).max(50).optional(),
  storagedrive_4: z.number().int().min(0).max(50).optional(),
  storagedrive_5: z.number().int().min(0).max(50).optional(),
  storagedrive_6: z.number().int().min(0).max(50).optional(),
  storagedrive_7: z.number().int().min(0).max(50).optional(),
  storagedrive_8: z.number().int().min(0).max(50).optional(),
  storagedrive_9: z.number().int().min(0).max(50).optional(),
  storagedrive_10: z.number().int().min(0).max(50).optional(),
  storagedrive_11: z.number().int().min(0).max(50).optional(),
  storagedrive_12: z.number().int().min(0).max(50).optional(),
  storagedrive_13: z.number().int().min(0).max(50).optional(),
  storagedrive_14: z.number().int().min(0).max(50).optional(),
  storagedrive_15: z.number().int().min(0).max(50).optional(),
  storagedrive_16: z.number().int().min(0).max(50).optional(),
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
  // The three FTP settings express reads from this icon and nothing here
  // could set: the name the conference wears over FTP (express.e:28948), how
  // far back a listing reaches (ftpd.e:1160), and whether uploads are
  // refused, with the sentence the caller is shown (express.e:28955).
  ftpdirname: z.string().max(200).optional(),
  ftp_dir_days: z.number().int().min(0).max(3650).optional(),
  no_ftp_uploads: z.boolean().optional(),
  no_ftp_uploads_text: z.string().max(200).optional(),
  menu_prompt: z.string().max(200).optional(),
  confdb_shared: z.number().int().min(0).optional(),
  use_username: z.boolean().optional(),
  use_realname: z.boolean().optional(),
  use_internetname: z.boolean().optional(),
  // Level 0 is a real access level - it is what a conference open to
  // everyone carries, and this board serves it. Requiring 1 meant such a
  // conference could not be saved.
  min_access_level: z.number().int().min(0).max(255).optional(),
  max_access_level: z.number().int().min(0).max(255).optional()
});

export const DoorSchema = z.object({
  door_name: z.string().min(1).max(100),
  door_command: z.string().min(1).max(50),
  // Whatever GET /config/doors can serve, this must accept - see
  // constants/door-types.ts. A door the admin page can open and not save is
  // how wall.info failed with "received XIM".
  door_type: z.enum(DOOR_TYPES),
  door_path: z.string().min(1).max(500),
  door_args: z.string().max(500).optional(),
  working_directory: z.string().max(500).optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']).optional(),
  door_options: z.array(z.string()).optional(),
  runtime_env: z.enum(DOOR_RUNTIME_ENVS).optional(),
  // 0 is a real value here, not an absence: the API's own
  // doorNormalAccessLevel() serves 0 for a door with no ACCESS tooltype, so
  // min(1) meant the schema rejected its own output and Add Door - which
  // posts 0 - could never succeed.
  min_security_level: z.number().int().min(0).max(255).optional(),
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
  // express.e:3025-3034 - findAcsLevel computes `secStatus/5*5` and walks
  // DOWN in fives until a file exists, falling back to 0. So a level that is
  // not a multiple of five names a file the BBS can never look for, and 0 is
  // a real level rather than an absence.
  security_level: z.number().int().min(0).max(255).multipleOf(5),
  acs_flag: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional()
});

// Drive Configuration (TOOLTYPE_DRIVES from express.e:17412-17418)
export const DriveConfigSchema = z.object({
  drive_number: z.number().int().min(1),
  drive_path: z.string().min(1).max(500),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),

  /**
   * The DRIVE.n.* sub-keys of a pooled volume.
   *
   * Optional throughout: a local drive has none of them, and a sysop who has
   * hand-written them into Drives.info must not have them erased by a save
   * that only meant to change the path - the writer omits a key it was not
   * given rather than clearing it.
   *
   * The secret is deliberately NOT here. It never goes in Drives.info; it is
   * written to its own file by the existing secret endpoint.
   */
  provider: z.string().max(40).optional(),
  endpoint: z.string().max(500).optional(),
  region: z.string().max(60).optional(),
  keyId: z.string().max(200).optional(),
  quotaBytes: z.number().int().nonnegative().optional(),
  volumeClass: z.enum(['FREE', 'PAID']).optional(),
  egress: z.enum(['FREE', 'METERED', '3X']).optional(),
  retentionDays: z.number().int().nonnegative().optional(),
  requestBudget: z.number().int().nonnegative().optional()
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

/**
 * A validation failure a person can read, and paste somewhere.
 *
 * A ZodError's own message is the whole issue array as JSON. Shown in a
 * toast that is one line high and closes itself, it told a sysop nothing
 * about which field was rejected - a save failed, and the reason was
 * technically on screen and practically unreachable.
 */
export function describeValidationError(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return null;

  const parts = issues.slice(0, 6).map((raw) => {
    const issue = raw as { path?: unknown[]; message?: string; received?: unknown };
    const field = Array.isArray(issue.path) && issue.path.length > 0
      ? issue.path.join('.')
      : 'value';
    const detail = issue.message ?? 'is not valid';
    return `${field}: ${detail}`;
  });

  const more = issues.length > parts.length ? ` (and ${issues.length - parts.length} more)` : '';
  return `Configuration rejected - ${parts.join('; ')}${more}`;
}
