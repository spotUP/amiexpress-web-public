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
  expert: string; // "X" or "N" per express.e
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

// Door game interface - mirrors AmiExpress door execution
export interface Door {
  id: string;
  name: string;
  description: string;
  command: string; // Command to execute (e.g., "SAL", "CHECKUP")
  path: string; // Path to door executable or script
  conferenceId?: number; // Optional conference restriction
  accessLevel: number; // Minimum security level required
  enabled: boolean;
  type: 'native' | 'script' | 'web' | 'typescript'; // Type of door implementation
  parameters?: string[]; // Optional parameters for door execution
}

// Door session interface - tracks door execution state
export interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'error';
  output?: string[];      // Output lines from door
  input?: string[];       // Input lines to door
}

// Chat system interfaces - mirrors AmiExpress chat implementation
export interface ChatSession {
  id: string;
  userId: string;
  sysopId?: string;
  startTime: Date;
  endTime?: Date;
  status: 'paging' | 'active' | 'ended';
  messages: ChatMessage[];
  pageCount: number;
  lastActivity: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isSysop: boolean;
}

export interface ChatState {
  sysopAvailable: boolean;
  activeSessions: ChatSession[];
  pagingUsers: string[]; // User IDs currently paging
  chatToggle: boolean; // F7 chat toggle state
}

// Internode chat interfaces - for user-to-user chat across nodes
export interface InternodeChatSession {
  id: string;
  nodeId: number;
  userId: string;
  targetNodeId: number;
  targetUserId: string;
  startTime: Date;
  endTime?: Date;
  status: 'inviting' | 'active' | 'ended' | 'declined';
  lastActivity: Date;
}

export interface InternodeChatMessage {
  id: string;
  sessionId: string;
  fromNodeId: number;
  fromUserId: string;
  toNodeId: number;
  toUserId: string;
  content: string;
  timestamp: Date;
}

// Network message interfaces - QWK/FTN offline mail support
export interface QWKPacket {
  id: string;
  filename: string;
  size: number;
  created: Date;
  fromBBS: string;
  toBBS: string;
  messages: QWKMessage[];
  status: 'pending' | 'processing' | 'completed' | 'downloaded' | 'error';
  error?: string;
  processedAt?: Date;
}

export interface QWKMessage {
  id: number;
  conference: number;
  subject: string;
  from: string;
  to: string;
  date: Date;
  body: string;
  isPrivate: boolean;
  isReply: boolean;
  parentId?: number;
  attachments?: string[];
}

export interface FTNMessage {
  id: string;
  fromAddress: string; // FTN address format (zone:net/node.point@domain)
  toAddress: string;
  subject: string;
  body: string;
  date: Date;
  area: string; // Echo area name
  msgid?: string; // Message-ID
  replyTo?: string; // References
  attributes: number; // FTN message attributes
  status: 'pending' | 'sent' | 'received' | 'error' | 'archived';
}

// Multi-node support interfaces
export interface NodeSession {
  id: string;
  nodeId: number;
  userId?: string;
  socketId: string;
  state: string;
  subState?: string;
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  lastActivity: Date;
  status: 'active' | 'idle' | 'away' | 'disconnected';
  ipAddress?: string;
  location?: string;
  loadLevel?: number;      // Load level/priority for node
  currentUser?: string;    // Current username on this node
}

export interface NodeInfo {
  id: number;
  name: string;
  status: 'available' | 'busy' | 'maintenance' | 'offline';
  currentUser?: string;
  lastActivity?: Date;
  description?: string;
}

// AREXX scripting interfaces
export interface AREXXScript {
  id: string;
  name: string;
  description: string;
  filename: string;
  path: string;
  script?: string;        // Script source code content
  accessLevel: number;
  enabled: boolean;
  parameters?: AREXXParameter[];
  triggers?: AREXXTrigger[];
}

export interface AREXXParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

export interface AREXXTrigger {
  event: 'login' | 'logout' | 'message_post' | 'file_upload' | 'command' | 'timer';
  condition?: string; // Optional condition script
  priority: number;
}

export interface AREXXContext {
  scriptId: string;
  userId?: string;
  sessionId?: string;
  user?: any;             // User object for script context
  parameters: Record<string, any>;
  environment: Record<string, any>;
  output: string[];
  result?: any;
  error?: string;
}

// Protocol support interfaces
export interface FileTransferProtocol {
  id: string;
  name: string;
  type: 'zmodem' | 'ymodem' | 'xmodem' | 'xmodem-crc' | 'xmodem-1k' | 'punter' | 'ftp' | 'websocket';
  enabled: boolean;
  config: Record<string, any>;
}

// C64-compatible transfer protocols (for PETSCII terminals)
export type C64TransferProtocol = 'punter' | 'xmodem' | 'xmodem-crc';

// All supported file transfer protocols
export type SupportedProtocol = 'zmodem' | 'ymodem' | 'xmodem' | 'xmodem-crc' | 'xmodem-1k' | 'punter' | 'websocket';

// Protocol display names
export const PROTOCOL_DISPLAY_NAMES: Record<SupportedProtocol, string> = {
  'zmodem': 'ZMODEM',
  'ymodem': 'YMODEM (Batch)',
  'xmodem': 'XMODEM (Checksum)',
  'xmodem-crc': 'XMODEM-CRC',
  'xmodem-1k': 'XMODEM-1K',
  'punter': 'Punter (C64)',
  'websocket': 'WebSocket (Browser)'
};

export interface TransferSession {
  id: string;
  protocol: string;
  userId: string;
  direction: 'upload' | 'download';
  filename: string;
  size: number;
  bytesTransferred: number;
  status: 'starting' | 'active' | 'paused' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  error?: string;
  checksum?: string;
}
