export interface User {
  id: string;
  username: string;
  useRealName: boolean;
  realname: string;
  expert?: string; // "Y" or "N" - mirrors AmiExpress expert mode
  lastLogin?: Date; // For "N" command - new files since last login
  uploads?: number; // Number of files uploaded
  bytesUpload?: number; // Total bytes uploaded
  downloads?: number; // Number of files downloaded
  bytesDownload?: number; // Total bytes downloaded
  secLevel?: number; // Security level (mirrors AmiExpress secStatus)
  // Add other properties as needed based on the project
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
  type: 'native' | 'script' | 'web'; // Type of door implementation
  parameters?: string[]; // Optional parameters for door execution
}

// Door session interface - tracks door execution state
export interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'error';
  output?: string[];
  input?: string[];
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
  type: 'zmodem' | 'ftp' | 'websocket';
  enabled: boolean;
  config: Record<string, any>;
}

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