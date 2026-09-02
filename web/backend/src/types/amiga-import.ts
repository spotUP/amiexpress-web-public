/**
 * Amiga AmiExpress BBS Import/Export Data Structures
 *
 * These interfaces define the structure of data imported from Amiga BBS archives
 * and exported to Amiga-compatible formats.
 *
 * Reference: reference-boardBBS (~/Downloads/BBS_COPY)
 */

import type { User } from '../types';
import type { Conference } from '../database/types';

// ===== Complete BBS Archive Structure =====

export interface AmigaBBSArchive {
  // Core data
  users: AmigaUserData[];
  conferences: AmigaConference[];
  nodes: AmigaNodeData[];
  commands: AmigaCommand[];
  access: AmigaAccessLevel[];
  config: AmigaBBSConfig;

  // Optional data
  bulletins?: AmigaBulletin[];
  screens?: AmigaScreen[];
  callerLogs?: AmigaCallersLogEntry[];

  // Metadata
  archiveFormat: 'lha' | 'lzx' | 'zip';
  archivePath: string;
  extractedPath: string;
  importDate: Date;
}

// ===== User Data =====

/**
 * Amiga User.data record structure
 * Binary format from User.data, User.keys, user.misc files
 */
export interface AmigaUserData {
  // Core identity
  username: string;
  passwordHash: string; // Original Amiga hash (DES or custom)
  realname?: string;
  location?: string;
  phone?: string;
  email?: string;

  // Security and access
  secLevel: number; // 0-255
  userFlags: number; // Bitfield

  // Statistics
  uploads: number;
  downloads: number;
  bytesUpload: number;
  bytesDownload: number;
  ratio: number;
  ratioType: number;

  // Time tracking
  timeTotal: number; // Total time online (minutes)
  timeLimit: number; // Daily time limit
  timeUsed: number; // Time used today
  chatLimit: number;
  chatUsed: number;

  // Login tracking
  lastLogin?: Date;
  firstLogin: Date;
  calls: number;
  callsToday: number;

  // User preferences
  newUser: boolean;
  expert: boolean;
  ansi: boolean;
  linesPerScreen: number;
  computer?: string;
  screenType: number;
  protocol?: string;
  editor?: string;
  zoomType: number;

  // Chat/node settings
  availableForChat: boolean;
  quietNode: boolean;
  autoRejoin: boolean;

  // Conference/area access
  confAccess?: string; // Conference access bitmap
  areaName?: string;

  // Networking
  uuCP: boolean;

  // Performance stats
  topUploadCPS: number;
  topDownloadCPS: number;
  byteLimit: number;

  // Extended data (from user.misc)
  miscData?: Buffer;

  // Slot number (for node files)
  slotNumber?: number;
}

/**
 * User key index entry
 */
export interface AmigaUserKey {
  username: string;
  offset: number; // Offset in User.data file
}

// ===== Conference Data =====

/**
 * Complete conference structure
 */
export interface AmigaConference {
  number: number; // Conference number (1-14 typically)
  database: ConferenceDatabase;
  menu: string; // Menu.txt contents
  fileAreas: AmigaFileArea[];
  messageBases: AmigaMessageBase[];
  bulletins?: string[];
}

/**
 * Conference database (Conf.DB) structure
 * Binary format - needs reverse engineering from reference-boardBBS
 */
export interface ConferenceDatabase {
  // Core settings
  conferenceNumber: number;
  conferenceName: string;
  description?: string;

  // Access control
  accessLevel: number;
  uploadAccessLevel?: number;
  downloadAccessLevel?: number;

  // Flags and settings
  flags: number; // Bitfield
  type: 'MSGBBS' | 'UPLOADS' | 'BOTH';

  // Paths (relative to BBS root)
  messagePath?: string;
  uploadPath?: string;
  bulletinPath?: string;

  // Limits and quotas
  maxMessages?: number;
  maxFiles?: number;

  // Raw binary data (for preservation)
  rawData?: Buffer;
}

/**
 * File area definition
 */
export interface AmigaFileArea {
  number: number; // Dir0, Dir1, Dir2, etc.
  name: string;
  description?: string;
  path: string;
  accessLevel: number;
  uploadAccessLevel: number;

  // Settings from .info file
  settings?: Map<string, string>;
}

/**
 * Message base structure
 */
export interface AmigaMessageBase {
  name: string;
  path: string;
  messages: AmigaMessage[];
}

/**
 * Individual message
 */
export interface AmigaMessage {
  number: number;
  from: string;
  to: string;
  subject: string;
  date: Date;
  body: string;
  flags: number;
  replyTo?: number;
  nextReply?: number;
}

// ===== Node Data =====

/**
 * Node-specific data
 */
export interface AmigaNodeData {
  nodeNumber: number;
  callersLog?: AmigaCallersLogEntry[];
  doorLog?: AmigaDoorLogEntry[];
  errorLog?: string[];
  answers?: Buffer; // User answers file
  playPenFiles?: string[];
  modemConfig?: Map<string, string>;
}

/**
 * Callers log entry
 */
export interface AmigaCallersLogEntry {
  username: string;
  loginTime: Date;
  logoffTime?: Date;
  duration: number; // Minutes
  uploaded: number;
  downloaded: number;
  messagesRead: number;
  messagesPosted: number;
  node: number;
  baud?: number;
  location?: string;
}

/**
 * Door log entry
 */
export interface AmigaDoorLogEntry {
  username: string;
  doorName: string;
  startTime: Date;
  duration: number;
  node: number;
}

// ===== Command/Door Definitions =====

/**
 * Command definition from .info files
 */
export interface AmigaCommand {
  name: string;
  type: 'DOOR' | 'BBSCMD' | 'SYSCMD' | 'CONFCMD';
  path?: string;
  description?: string;
  accessLevel: number;
  flags: number;

  // Settings from .info file tool types
  settings: Map<string, string>;

  // Icon data (optional)
  icon?: AmigaIcon;
}

/**
 * Amiga icon data
 */
export interface AmigaIcon {
  width: number;
  height: number;
  depth: number;
  data: Buffer;
}

// ===== Access Levels =====

/**
 * Access level definition
 */
export interface AmigaAccessLevel {
  level: number; // 0-255
  name: string;
  description?: string;

  // Permissions
  canUpload: boolean;
  canDownload: boolean;
  canPost: boolean;
  canRead: boolean;
  canChat: boolean;
  canUseDoors: boolean;

  // Limits
  timeLimit: number;
  downloadLimit: number;
  uploadRatio: number;

  // Settings from ACS.*.info file
  settings: Map<string, string>;
}

// ===== Configuration =====

/**
 * BBS configuration from bbsConfig.info
 */
export interface AmigaBBSConfig {
  // Registration
  regKey?: string;

  // Email/SMTP settings
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpSSL?: boolean;
  sysopEmail?: string;
  bbsEmail?: string;

  // Notifications
  mailOnNewUser?: boolean;
  mailOnSysopComment?: boolean;
  mailOnPwdFail?: boolean;

  // FTP settings
  ftpPort?: number;
  ftpHost?: string;
  ftpDataPorts?: string;

  // Security
  passwordSecurity: 'LEGACY' | 'BCRYPT';

  // Async execution
  executeAsyncOnLogon?: string;
  executeAsyncOnLogoff?: string;

  // All tool types as key-value pairs
  toolTypes: Map<string, string>;
}

// ===== Misc Data =====

/**
 * Bulletin definition
 */
export interface AmigaBulletin {
  name: string;
  content: string;
  date?: Date;
  accessLevel?: number;
}

/**
 * Screen definition
 */
export interface AmigaScreen {
  /** The file's own name, e.g. `LOGON.TXT`. */
  name: string;
  /**
   * Where it sits on the board, relative to the BBS root - `Node3/LOGON.TXT`,
   * `Conf2/Screens/Menu.txt`, `Screens/uprough.txt`.
   *
   * A screen's directory IS its routing: the same name means a different
   * screen in `Node3/` and in `Conf2/Screens/`, and flattening them into one
   * `Screens/` directory - which is what an import used to do - silently
   * merges screens that were never the same file.
   */
  relPath: string;
  /**
   * The file's BYTES.
   *
   * Not a string: a screen is ANSI art full of high-bit Amiga characters, and
   * `readFile(path, 'utf-8')` does not throw on those - it silently replaces
   * each one with U+FFFD. An import read them that way and then wrote them
   * back as UTF-8, so every imported screen lost its art.
   */
  content: Buffer;
  type: 'ANSI' | 'ASCII';
}

// ===== Import/Export Metadata =====

/**
 * Conflict resolution strategies
 */
export type ConflictResolutionStrategy = 'skip' | 'replace' | 'rename' | 'merge';

/**
 * Import session tracking
 */
export interface ImportSession {
  id: string;
  userId?: string;
  archivePath: string;
  archiveFormat?: 'lha' | 'lzx' | 'zip';
  extractedPath?: string;

  // Status
  status: 'pending' | 'validating' | 'previewing' | 'resolving' | 'importing' | 'completed' | 'failed' | 'rolled_back';
  progress: number; // 0-100
  currentOperation?: string;

  // Timestamps
  createdAt: Date;
  startTime?: Date;
  endTime?: Date;

  // Data summary
  summary?: ImportSummary;

  // Parsed import data (after validation)
  importData?: AmigaBBSArchive;

  // Validation results
  validationResults?: any;

  // Conflicts
  conflicts: ImportConflict[];

  // Errors
  errors?: string[];

  // Backup
  backupPath?: string;

  // Result (after import completes)
  result?: ImportResult;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  usersImported: number;
  conferencesImported: number;
  commandsImported: number;
  errors: string[];
  warnings: string[];
}

/**
 * Import summary
 */
export interface ImportSummary {
  totalUsers: number;
  newUsers: number;
  updatedUsers: number;
  skippedUsers: number;

  totalConferences: number;
  newConferences: number;
  updatedConferences: number;
  skippedConferences: number;

  totalMessages: number;
  importedMessages: number;

  configChanges: Array<{ key: string; oldValue: any; newValue: any }>;
}

/**
 * Import conflict
 */
export interface ImportConflict {
  id: string;
  type: 'user' | 'conference' | 'command' | 'config';
  field: string;
  existing: any;
  import: any;
  resolution?: 'skip' | 'replace' | 'rename' | 'merge';
  resolvedValue?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

/**
 * Conflict report
 */
export interface ConflictReport {
  userConflicts: ImportConflict[];
  conferenceConflicts: ImportConflict[];
  commandConflicts: ImportConflict[];
  configConflicts: ImportConflict[];
  recommendations: string[];
}

// ===== Export Session =====

/**
 * Export session tracking
 */
export interface ExportSession {
  id: string;
  userId: string;
  outputPath: string;
  archiveFormat: 'lha' | 'lzx' | 'zip';

  // Options
  options: ExportOptions;

  // Status
  status: 'pending' | 'building' | 'archiving' | 'completed' | 'failed';
  progress: number; // 0-100
  currentOperation: string;

  // Timestamps
  startTime: Date;
  endTime?: Date;

  // Errors
  errors: string[];
}

/**
 * Export options
 */
export interface ExportOptions {
  // What to export
  includeUsers: boolean;
  includeConferences: boolean;
  includeMessages: boolean;
  includeFileAreas: boolean;
  includeCommands: boolean;
  includeConfig: boolean;
  includeBulletins: boolean;
  includeScreens: boolean;

  // Archive format
  format: 'lha' | 'lzx' | 'zip';

  // Filters
  conferenceIds?: string[]; // Specific conferences to export
  usernamePrefixes?: string[]; // Export users starting with prefix
  dateRange?: { start: Date; end: Date }; // Message date range
}
