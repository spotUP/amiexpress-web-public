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
  alias?: string;  // User alias/handle
  securityFlags?: string;
  secOverride?: string;
  userFlags: number;
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
  http_port: number;

  // BBS Server Ports
  telnet_port: number;         // Telnet server port (default: 64128)
  ssh_port: number;            // SSH server port (default: 31337)

  // System Behavior (TOOLTYPE_BBSCONFIG)
  quiet_join: boolean;         // Suppress conference join messages
  convert_to_mb: boolean;      // Convert byte counts to megabytes

  // Registration
  reg_key: string;             // BBS registration key

  // Logging
  debug_mode: boolean;
  log_level: string;
  log_retention_days: number;
  sysop_debug_enabled: boolean;

  // Push Notifications (VAPID)
  vapid_public_key: string;
  vapid_private_key: string;
  vapid_contact_email: string;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * Node Configuration (1-8 nodes)
 * TOOLTYPE_NODE from express.e
 */
export interface NodeConfig {
  id: number;
  node_number: number;  // 1-8

  // Node Settings
  node_start: string;
  priority: number;  // -1 to 20

  // Display Settings
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

  // Directory Settings (1-16)
  ndirs: number;
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
  id: number;

  // Door Identity
  door_name: string;
  door_command: string;
  door_type: 'SYSCMD' | 'BBSCMD' | 'INTERNAL';

  // Execution Settings
  door_path: string;
  door_args: string;
  working_directory: string;

  // Door Options
  priority: string;  // P0-P4
  door_options: string[];
  runtime_env: 'AMIGA_68K' | 'NATIVE_NODE' | 'BROWSER';

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
