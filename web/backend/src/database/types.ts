import type { VolumeClass, EgressPosture } from '../storage/volume-config';
import type { DoorType, DoorRuntimeEnv } from '../constants/door-types';
/**
 * Database Type Definitions
 * Extracted from database.ts for better modularity
 *
 * All interfaces match AmiExpress data structures from express.e
 */

// Database interfaces matching AmiExpress data structures
export interface User {
  id: string;
  slotNumber?: number;  // Permanent slot in user.data/keys/misc files (1-indexed)
  username: string;
  passwordHash: string;
  realname: string;
  realName?: string;  // Alias for realname
  location: string;
  phone: string;
  phoneNumber?: string;  // Alias for phone
  email?: string;
  secLevel: number;
  uploads: number;
  downloads: number;
  bytesUpload: number;
  uploadBytes?: number;  // Alias for bytesUpload
  bytesDownload: number;
  downloadBytes?: number;  // Alias for bytesDownload
  ratio: number;
  ratioType: number;
  downloadRatio?: number;  // Alias for ratio
  timeTotal: number;
  timeLimit: number;
  dailyTimeLimit?: number;  // Alias for timeLimit
  timeUsed: number;
  chatLimit: number;
  chatUsed: number;
  lastLogin?: Date;
  timeLastOn?: Date;  // Alias for lastLogin
  firstLogin: Date;
  accountDate?: Date;  // Alias for firstLogin
  calls: number;
  timesCalled?: number;  // Alias for calls
  callsToday: number;
  timesOnToday?: number;  // Alias for callsToday
  messagesPosted?: number;  // Number of messages posted
  newUser: boolean;
  expert: string; // "X" for expert, "N" for menus (express.e)
  ansi: boolean;
  linesPerScreen: number;
  computer: string;
  screenType: string;
  protocol: string;
  editor: string;
  zoomType: string;
  availableForChat: boolean;
  quietNode: boolean;
  autoRejoin: number;
  confRJoin?: number;  // Alias for autoRejoin
  confAccess: string;
  areaName: string;
  uuCP: boolean;
  topUploadCPS: number;
  topDownloadCPS: number;
  byteLimit: number;
  dailyBytesLimit?: number;  // Alias for byteLimit
  dailyBytesDld?: number;  // Daily bytes downloaded
  bytesAvailableForDownload?: number;  // Calculated available download bytes
  lastDownloadTime?: Date;  // Last download timestamp
  newSinceDate?: Date;  // Date for "new files since" marker
  // Credit accounts (prepaid download bypass)
  creditDays?: number;
  creditAmount?: number;
  creditStartDate?: number;
  creditTotalToDate?: number;
  creditTotalDate?: number;
  creditTracking?: number;
  baud?: number;  // Connection baud rate (for web = 57600)
  // Disk-only (user.data secBulletin / user.keys baud): the chosen index into the board's computer list (express.e:11344) and the connect speed the account was made on (express.e:30269). No column; the record keeps them.
  computerIndex?: number;
  connectBaud?: number;
  alias?: string;  // User alias/handle
  securityFlags?: string;
  secOverride?: string;
  userFlags: number;
  fontPreference?: string;  // Terminal font preference (web extension)
  /** 'vdc' (a C128's 80-column colours) or 'vic' (a C64's). Web extension. */
  petsciiPalette?: string;
  /** 'standard' or 'swedish' - which character ROM the PETSCII screen draws. */
  petsciiCharset?: string;
  /** True when the caller turned board animations off (W row 23). Stored negative so it defaults to on. Web extension. */
  noAnimations?: boolean;
  themePreference?: string; // Door colour theme (web extension); '' or an unknown id = the board default
  /** The caller's own menu style; '' = the board's default for their width and level (web extension, column menustyle). */
  menuStyle?: '' | 'classic' | 'scroll' | 'coverflow';   // a row may still hold the retired 'pages': readMenuStyle reads it as scroll
  editorType?: number;     // 0=line, 1=simple, 2=fullscreen (express.e loggedOnUser.editorType)
  internetName?: string;   // Internet/email name (express.e loggedOnUserMisc.internetName)
  /** Co-sysop persona slug the caller chose - '' for board default, 'random', or a preset/board slug. */
  aiPersona?: string;
  // WEB_: GDPR consent metadata (ISO-8601 timestamp, notice semver, capture point)
  gdprConsentAt?: string;
  gdprNoticeVersion?: string;
  gdprConsentSource?: 'registration' | 'relogin' | 'import';
  // WEB_: GDPR soft-delete + erasure markers (Phase 3).
  deletedAt?: string;
  erasedAt?: string;
  // Lockout state off user.misc (express.e userMisc: accountLocked,
  // invalidAttempts, forcePwdReset, pwdLastUpdated). Carried on User so the
  // admin can list it and the unlock path can set it; the login gate and the
  // password check read the same disk record. Optional: database rows never
  // hold these, only disk-synced User objects do.
  accountLocked?: number;
  invalidAttempts?: number;
  forcePwdReset?: number;
  pwdLastUpdated?: number;
  /**
   * The user.data record's own slotNumber field is 0: a deleted account
   * (express.e:21364, refused at logon 29701). Disk-only, like the lock
   * fields: `slotNumber` above stays the POSITION, so a deleted account keeps
   * its record and can be re-activated (21374-21378). Undefined means "leave
   * the disk's state alone" to every writer.
   */
  accountDeleted?: boolean;
  /**
   * user.data's msgBaseRJoin (INT), todaysBytesLimit (LONG) and uucpa (CHAR),
   * axobjects.e:61-65. Disk-only like the fields above: the table has no
   * column for the first two, and its `uucp` is the yes/no `uuCP`, while the
   * record holds the number the sysop typed (express.e:21596). Undefined
   * means "leave the disk's value alone" to every writer.
   */
  msgBaseRJoin?: number;
  todaysBytesLimit?: number;
  uucpa?: number;
  created: Date;
  updated: Date;
}

export interface Message {
  id: number;
  subject: string;
  body: string;
  author: string;
  timestamp: Date;
  conferenceId: number;
  messageBaseId: number;
  isPrivate: boolean;
  toUser?: string;
  parentId?: number;
  attachments?: string[];
  edited?: boolean;
  editedBy?: string;
  editedAt?: Date;
  receivedAt?: Date;  // express.e:8915-8926 - When recipient read the message (mailHeader.recv)
}

export interface FileArea {
  id: number;
  name: string;
  description: string;
  path: string;
  conferenceId: number;
  maxFiles: number;
  uploadAccess: number;
  downloadAccess: number;
  created: Date;
  updated: Date;
  /** The drive this area's files live on. Undefined means local disk - every area on every board that has not configured a bucket. */
  storageVolume?: number;
  /** Which class of pooled volume new files in this area prefer. Undefined means local disk. */
  volumeClassPref?: 'FREE' | 'PAID';
}

export interface FileEntry {
  id: number;
  filename: string;
  description: string;
  size: number;
  uploader: string;
  uploadDate: Date;
  downloads: number;
  areaId: number;
  conferenceId?: number;  // Conference ID for the file area
  filePath?: string;      // Full file path on disk
  fileIdDiz?: string;
  rating?: number;
  votes?: number;
  status: 'active' | 'held' | 'deleted';
  checked: 'N' | 'P' | 'F';
  comment?: string;
  /** The drive holding this object. Undefined means local disk - every row on every board that has not configured a bucket. */
  storageVolume?: number;
  /** The object key on that drive. Undefined means local disk. */
  objectKey?: string;
}

export interface Conference {
  id: number;
  name: string;
  description: string;
  // Per-conference accounting (express.e confBase)
  ratio?: number;             // secLibrary for this conference
  ratioType?: number;         // secBoard for this conference (0=bytes,1=bytes+files,2=files)
  uploads?: number;           // upload count in this conference
  downloads?: number;         // download count in this conference
  bytesUpload?: number;       // uploaded bytes in this conference
  bytesDownload?: number;     // downloaded bytes in this conference
  created: Date;
  updated: Date;
}

export interface MessageBase {
  id: number;
  name: string;
  /**
   * NAME.n exactly as MsgBases.info declares it - '' when it declares none.
   *
   * `name` falls back to "Message Base <n>" so a list has a label; the mail
   * scan needs to know whether the board named the base at all, because
   * express.e:11675 prints its "Message Base:" line only when it did.
   */
  declaredName?: string;
  conferenceId: number;
  created: Date;
  updated: Date;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  type: 'discord' | 'slack';
  enabled: boolean;
  triggers: string[];
  /**
   * Door names this webhook is restricted to, matched case-insensitively.
   * Empty means "every door" - without this, every door_score webhook fired
   * for every door, so a board with one webhook per game got each score
   * posted to all of them.
   */
  doorFilter: string[];
  /**
   * Achievement tiers this webhook fires for (SP2), shaped like doorFilter:
   * a JSON array, empty means every tier. Read only by achievement_unlocked.
   */
  tierFilter: string[];
  created: Date;
  updated: Date;
}

export interface Session {
  id: string;
  userId?: string;
  socketId: string;
  state: string;
  subState?: string;
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  lastActivity: Date;
  confRJoin: number;
  msgBaseRJoin: number;
  commandBuffer: string;
  menuPause: boolean;
  inputBuffer: string;
  relConfNum: number;
  currentConfName: string;
  cmdShortcuts: boolean;
  tempData?: string;
  created: Date;
  updated: Date;
}

export interface Bulletin {
  id: number;
  conferenceId: number;
  filename: string;
  title: string;
  created: Date;
  updated: Date;
}

export interface SystemLog {
  id: number;
  timestamp: Date;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  userId?: string;
  nodeId?: number;
  context?: string;
}

// ===== Configuration Types =====

/**
 * System Configuration (Singleton)
 * TOOLTYPE_BBSCONFIG from express.e
 */
export interface SystemConfig {
  id: number;  // Always 1 (singleton)

  // Identity
  bbs_name: string;
  sysop_name: string;
  location: string;
  phone: string;
  email: string;
  website: string;

  // Security & Authentication
  min_password_length: number;
  min_password_strength: number;
  max_password_fails: number;
  password_security: string;
  strict_password_policy: boolean;
  auto_validate: boolean;
  confirm_deletions: boolean;

  // Session Settings
  default_time_limit: number; // -1 = unlimited
  max_session_time: number;   // -1 = unlimited
  idle_timeout: number;

  // New User Defaults
  new_user_sec_level: number;    // default 30
  new_user_time_limit: number;   // -1 = unlimited
  new_user_chat_limit: number;   // -1 = unlimited
  new_user_lines_per_screen: number;
  new_user_expert: boolean;
  new_user_ansi: boolean;
  new_user_protocol: string;
  new_user_screen_type: string;
  new_user_editor: string;
  new_user_conf_access: string;
  new_user_available_chat: boolean;
  new_user_quiet_node: boolean;
  new_user_auto_rejoin: boolean;

  // Display Settings
  ansi_enabled: boolean;
  /** 16, or 8 for a board whose callers see the Amiga's pens. */
  terminal_colours?: number;
  color_scheme: string;
  allow_custom_screens: boolean;

  // Language
  language_base: string;
  default_language: string;

  // Limits
  max_conferences: number;
  max_message_bases: number;
  max_file_areas: number;
  max_nodes: number;

  // File Management
  file_check_enabled: boolean;
  upload_check_virus: boolean;
  upload_check_dupe: boolean;

  // Mail & SMTP Settings (TOOLTYPE_BBSCONFIG from reference-boardBBS)
  allow_internet_email: boolean;
  smtp_server: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;  // Encrypted
  smtp_ssl: boolean;
  smtp_from_email: string;
  sysop_email: string;
  bbs_email: string;

  // FTP Server Settings (TOOLTYPE_BBSCONFIG, express.e:15485-15489, 15536-15540)
  ftp_enabled: boolean;
  ftp_host: string;
  ftp_port: number;
  ftp_data_ports: string;  // Comma-separated ports, e.g., "50101,50102,50103"

  // HTTP Server Settings (TOOLTYPE_XFERLIB, express.e:15002-15006, 15019-15027)
  http_enabled: boolean;
  http_host: string;
  /** express's HTTPPORT. Absent on a board that never set one - express
   * computes 20000+node for an empty tooltype (express.e:15713), which no
   * board-wide value can say. Nothing here binds it. */
  http_port?: number;

  // BBS Server Ports
  telnet_port: number;         // Telnet server port (default: 64128)
  ssh_port: number;            // SSH server port (default: 31337)

  // System Behavior (TOOLTYPE_BBSCONFIG)
  quiet_join: boolean;         // Suppress conference join messages
  convert_to_mb: boolean;      // Convert byte counts to megabytes

  // Registration

  // Logging
  debug_mode: boolean;
  log_level: string;
  log_retention_days: number;
  sysop_debug_enabled: boolean;
  /** WEB_: GDPR Phase 5 — default false; anonymises webhook payloads. */
  webhook_include_pii?: boolean;

  // Push Notifications (VAPID)
  vapid_public_key: string;
  vapid_private_key: string;
  vapid_contact_email: string;

  // Achievements (SP2): the door server this board reports to, its board
  // key (encrypted at rest, like vapid_private_key), and the switch stored
  // as the negative so an absent column reads as ON.
  achievements_server_url?: string;
  achievements_board_key?: string;
  achievements_disabled?: boolean;

  // Mail Notifications (MAIL_ON_* flags from express.e:6694-6739, 24197, 29155)
  mail_on_upload: boolean;         // Email sysop when user uploads a file
  mail_on_sysop_comment: boolean;  // Email sysop when user sends comment
  mail_on_logon: boolean;          // Email sysop when user logs on
  mail_on_new_user: boolean;       // Email sysop when new user registers
  mail_on_logoff: boolean;         // Email sysop when user logs off
  mail_on_sysop_page: boolean;     // Email sysop when user pages
  mail_on_pwd_fail: boolean;       // Email user on password failure (reset link)

  // Auto-Validation Settings (express.e:29677-29688, 30063-30076)
  autoval_delay: number;           // Hours before auto-validation (0 = immediate, -1 = disabled)
  autoval_preset: string;          // Preset name to apply on auto-validation
  autoval_password: string;        // Password for instant auto-validation

  // Password Expiry (express.e:29785-29787)
  password_expiry_days: number;    // Days until password expires (0 = never)

  // User Management (express.e:31952)
  auto_deactivate_days: number;    // Days of inactivity before deactivating user (0 = never)

  // File Management (express.e:19258, 31801, 31804)
  filediz_syscmd: string;          // Command for extracting file descriptions
  max_desclines: number;           // Maximum lines for file descriptions
  hold_access_level: number;       // Access level required to hold files

  // Local Upload Path (express.e:17891)
  local_upload_path: string;       // Default path for local uploads

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Node Configuration (1-255 nodes)
 * TOOLTYPE_NODE from express.e
 */
export interface NodeConfig {
  id: number;
  node_number: number;  // 1-255

  // Node Settings
  node_start: string;
  priority: number;  // -1 to 20

  // Display Settings
  // ACP.e:2666-2673 - the directory this node's screens are read from. Empty
  // means express.e's default, `<bbsLoc>/Node<N>/`. Set it to share one
  // screen set across many nodes (a board with more nodes than screen
  // directories has no other way).
  screens: string;
  capitol_files: boolean;
  def_screens: boolean;
  no_mci_msg: boolean;

  // Chat Settings
  sysop_chat_color: number;
  user_chat_color: number;
  break_chat: boolean;

  // File Transfer Settings
  sentby_files: boolean;
  keep_upload_credit: boolean;
  free_resuming: boolean;

  // Logging Settings
  callers_log: boolean;
  start_log: boolean;
  door_log: boolean;
  ud_log: boolean;
  log_host: boolean;
  /** SHOWPWFAIL - log the password a caller actually typed (express.e:30030). */
  show_password_fails?: boolean;
  /** USERNUMBER_LOGIN - a caller may type his slot number (express.e:29598). */
  usernumber_login?: boolean;

  // Network Settings
  telnet: boolean;
  ftp: boolean;

  // Security Settings
  disable_quick_logons: boolean;
  view_password: boolean;

  // Modem/Network
  no_rad_boogie: boolean;
  nrams: string[];  // Array of init strings

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Conference Configuration
 * TOOLTYPE_CONF from express.e
 */
export interface ConferenceConfig {
  id: number;
  conference_id: number;
  name: string;
  /**
   * LOCATION.n from ConfConfig.info - the directory this conference reads,
   * which is NOT derivable from its number on a renumbered board. The admin
   * derives its default file-area paths from this.
   */
  location: string;

  // Directory Settings (1-16)
  ndirs: number;
  /**
   * STORAGEDRIVE.n from Conf<N>.info: which DRIVE.n this directory's files
   * live on, or 0 for local disk. 0 is the absence of the tooltype.
   */
  storagedrive_1?: number;
  storagedrive_2?: number;
  storagedrive_3?: number;
  storagedrive_4?: number;
  storagedrive_5?: number;
  storagedrive_6?: number;
  storagedrive_7?: number;
  storagedrive_8?: number;
  storagedrive_9?: number;
  storagedrive_10?: number;
  storagedrive_11?: number;
  storagedrive_12?: number;
  storagedrive_13?: number;
  storagedrive_14?: number;
  storagedrive_15?: number;
  storagedrive_16?: number;
  dlpath_1: string;
  dlpath_2: string;
  dlpath_3: string;
  dlpath_4: string;
  dlpath_5: string;
  dlpath_6: string;
  dlpath_7: string;
  dlpath_8: string;
  dlpath_9: string;
  dlpath_10: string;
  dlpath_11: string;
  dlpath_12: string;
  dlpath_13: string;
  dlpath_14: string;
  dlpath_15: string;
  dlpath_16: string;
  ulpath_1: string;
  ulpath_2: string;
  ulpath_3: string;
  ulpath_4: string;
  ulpath_5: string;
  ulpath_6: string;
  ulpath_7: string;
  ulpath_8: string;
  ulpath_9: string;
  ulpath_10: string;
  ulpath_11: string;
  ulpath_12: string;
  ulpath_13: string;
  ulpath_14: string;
  ulpath_15: string;
  ulpath_16: string;

  // Conference Settings
  force_newscan: boolean;
  no_newscan: boolean;
  show_new_files: boolean;
  no_new_files: boolean;
  free_downloads: boolean;
  exclude_ftp: boolean;
  /** FTPDIRNAME - the conference's name over FTP (express.e:28948). */
  ftpdirname?: string;
  /** FTP_DIR_DAYS - how far back an FTP listing reaches (ftpd.e:1160). */
  ftp_dir_days?: number;
  /** NO_FTP_UPLOADS present - FTP uploads refused here (express.e:28955). */
  no_ftp_uploads?: boolean;
  /** What NO_FTP_UPLOADS holds - the refusal the caller reads. */
  no_ftp_uploads_text?: string;
  private_conf: boolean;
  read_only: boolean;
  menu_prompt: string;
  confdb_shared: number;  // Conference ID to share database with (0=none)

  // Name Display Options
  use_username: boolean;
  use_realname: boolean;
  use_internetname: boolean;

  // Access Control
  min_access_level: number;
  max_access_level: number;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Door/Command Configuration
 * TOOLTYPE_SYSCMD, TOOLTYPE_BBSCMD from express.e
 */
export interface Door {
  /**
   * Per-command flags (express.e:4732-4804 runCommand()).
   *
   * Each one is a real BBSCmd/SysCmd .info tooltype, checked with
   * checkToolTypeExists/readToolType against the COMMAND's own icon - not a
   * doors-table column. The admin's Doors page writes these through the
   * generic .info tooltype editor (getInfoFile/updateInfoFile), the same path
   * every other tooltype on a command's icon goes through; nothing here
   * reads or writes them via a doors-table row.
   */
  /** SILENT - suppresses the command's normal banner/status output. */
  silent?: boolean;
  /** EXPERT_MODE - the command is offered only to callers in expert mode. */
  expert_only?: boolean;
  /**
   * LOG_INPUTS - logs this command's keystrokes. express.e also honours a
   * node-wide LOG_INPUTS on TOOLTYPE_NODE; either one turns logging on.
   */
  log_inputs?: boolean;
  /** QUICKMODE - the command is skipped when the CALLER's quick flag (Q) is set. */
  quick_mode?: boolean;
  /** TRAPON - traps errors/Ctrl-C while the command runs. */
  trap_on?: boolean;
  /**
   * SCRIPTCHECK - forces the Amiga FIBF_SCRIPT protection bit onto the
   * command file so DOS treats it as a script. Only meaningful for the
   * SIM/TIM/IIM/SUP door types; express.e ignores it for anything else.
   */
  script_check?: boolean;
  /**
   * PASS_PARAMETERS - an integer, not a boolean. Only meaningful when
   * INTERNAL is also set on the same icon: 1 skips running the command
   * entirely, and any value above 0 also appends the caller's original
   * command-line parameters before re-dispatching.
   */
  pass_params?: number;
  /**
   * MIMICVER - a version string the command reports itself as, for callers
   * or scripts that branch on the BBS's advertised version.
   */
  mimic_version?: string;

  id: number;

  // Door Identity
  door_name: string;
  door_command: string;
  // The same vocabulary the API serves and the schema validates - see
  // constants/door-types.ts. Narrowing it to the three command sources is
  // what made an XIM door unsaveable from the admin page.
  door_type: DoorType;

  // Execution Settings
  door_path: string;
  door_args: string;
  working_directory: string;

  // Door Options
  priority: string;  // P0-P4
  door_options: string[];
  runtime_env: DoorRuntimeEnv;

  // Access Control
  min_security_level: number;
  max_security_level: number;
  required_flags: string;

  // Resource Limits
  time_limit: number;
  memory_limit: number;

  // Display Settings
  title: string;
  description: string;
  category: string;

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * System Languages (Singleton)
 * TOOLTYPE_LANGUAGES host language from express.e
 */
export interface SystemLanguages {
  id: number;  // Always 1 (singleton)

  // Host Language
  host_language: string;

  // Language Settings
  language_base_path: string;
  allow_user_selection: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Available Languages (1-10)
 * TOOLTYPE_LANGUAGES language list from express.e
 */
export interface Language {
  id: number;
  language_number: number;  // 1-10

  // Language Identity
  title: string;
  language_code: string;

  // File Settings
  file_path: string;

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * File Transfer Protocols
 * Protocol configuration from express.e
 */
export interface Protocol {
  id: number;

  // Protocol Identity
  protocol_name: string;
  protocol_code: string;

  // Protocol Settings
  command: string;
  upload_command: string;
  download_command: string;
  batch_upload: boolean;
  batch_download: boolean;
  bidirectional: boolean;

  // Status
  enabled: boolean;
  is_default: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Configuration Audit Log
 * Tracks all configuration changes
 */
export interface ConfigAuditLog {
  id: number;

  // Audit Fields
  table_name: string;
  record_id: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';

  // Change Details
  old_values?: string;  // JSON
  new_values?: string;  // JSON
  changed_fields: string[];

  // User Context
  user_id?: string;
  username: string;

  // Request Context
  ip_address?: string;
  user_agent?: string;

  // Metadata
  timestamp: Date;
}

/**
 * Security Level Access Control
 * TOOLTYPE_ACCESS from express.e (lines 3029, 8497, 28540)
 * Per-security-level ACS_* flag configuration
 */
export interface SecurityLevelAccess {
  id: number;

  // Security Level
  security_level: number;  // 1-255

  // Access Control Flag
  acs_flag: string;  // e.g., "READ_MESSAGE", "DOWNLOAD", "ENTER_MESSAGE"

  // Status
  enabled: boolean;

  // Description
  description?: string;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Drive Configuration
 * TOOLTYPE_DRIVES from express.e (lines 17412-17418)
 * File system drive/volume list
 */
export interface DriveConfig {
  id: number;

  // Drive Identity
  drive_number: number;  // 1-N
  drive_path: string;    // e.g., "DH1:", "/data/drive1"

  // Status
  enabled: boolean;

  // Description
  description?: string;

  /**
   * Pooled-volume settings, written to the DRIVE.n.* sub-keys of Drives.info.
   *
   * All optional: a local drive has none of them, and a save that omits one
   * leaves whatever the sysop hand-wrote in the file alone. The SECRET is
   * never here - it lives outside Drives.info, set by its own endpoint.
   */
  provider?: string;
  endpoint?: string;
  region?: string;
  keyId?: string;
  quotaBytes?: number;
  volumeClass?: VolumeClass;
  egress?: EgressPosture;
  retentionDays?: number;
  requestBudget?: number;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Computer Types
 * TOOLTYPE_COMPUTERLIST from express.e (lines 31954-31965)
 * List of computer types users can select from
 */
export interface ComputerType {
  id: number;

  // Computer Identity
  computer_number: number;  // 1-N
  computer_name: string;    // e.g., "AMiGA 500", "PC", "mAC"

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Screen Types
 * TOOLTYPE_SCREENTYPES from express.e (lines 31905-31915)
 * Terminal/screen format types (ANSI, ASCII, etc.)
 */
export interface ScreenType {
  id: number;

  // Screen Type Identity
  screen_number: number;  // 1-N
  screen_type: string;    // e.g., "TXT.GR", "IBM", "ASCII"
  screen_title: string;   // e.g., "Amiga Ansi", "IBM Ansi"

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * File Checkers
 * TOOLTYPE_FCHECK from express.e (lines 18556-18614, 31677-31681)
 * External file validation tools (virus scanners, archive validators)
 */
export interface FileChecker {
  id: number;

  // Checker Identity
  checker_name: string;  // e.g., "Virus Scanner", "Archive Validator"

  // Execution Settings
  checker_path: string;  // Path to checker executable
  options: string;       // Command-line options (express.e:18562-18564)
  stack_size: number;    // Stack size for process (express.e:18567-18571)
  priority: number;      // Process priority (express.e:18573-18577)

  // Post-Check Script
  script_path?: string;  // Optional script to run after check (express.e:18595-18606)

  // Status
  enabled: boolean;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * File Checker Error Patterns
 * ERROR.N patterns from TOOLTYPE_FCHECK (express.e:18614-18621)
 * Defines error strings to detect in checker output
 */
export interface FileCheckerError {
  id: number;

  // Parent Checker
  file_checker_id: number;

  // Error Pattern
  error_number: number;    // 1-N
  error_pattern: string;   // String to match in output

  // Metadata
  created_at: Date;
  updated_at: Date;
}
