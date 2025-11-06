/**
 * Database Type Definitions
 * Extracted from database.ts for better modularity
 *
 * All interfaces match AmiExpress data structures from express.e
 */

// Database interfaces matching AmiExpress data structures
export interface User {
  id: string;
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
  expert: boolean;
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
  baud?: number;  // Connection baud rate (for web = 38400)
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
