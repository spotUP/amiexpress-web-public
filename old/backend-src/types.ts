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
  quietMode?: boolean; // Quiet node - hide from WHO list (internalCommandQ)
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

// Internode chat interfaces - for user-to-user chat
export interface InternodeChatSession {
  id: number;
  session_id: string;
  initiator_id: string;
  recipient_id: string;
  initiator_username: string;
  recipient_username: string;
  status: 'requesting' | 'active' | 'ended' | 'declined';
  started_at: Date;
  ended_at?: Date;
  initiator_socket: string;
  recipient_socket: string;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface InternodeChatMessage {
  id: number;
  session_id: string;
  sender_id: string;
  sender_username: string;
  message: string;
  created_at: Date;
}

// Node management interfaces - for multi-node BBS support
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
  status: 'available' | 'busy' | 'down' | 'active' | 'idle' | 'disconnected';
  loadLevel: number; // 0-100, for load balancing
  currentUser?: string; // Current user ID on this node
}

export interface NodeInfo {
  id: number;
  name: string;
  description?: string;
  status: 'available' | 'busy' | 'down' | 'maintenance';
  currentUsers: number;
  maxUsers: number;
  loadLevel: number;
  lastActivity: Date;
  ipAddress?: string;
  port?: number;
  currentUser?: string; // Current user ID on this node
}

// AREXX scripting interfaces
export interface AREXXScript {
  id: string;
  name: string;
  description: string;
  script: string;
  trigger: string; // Event that triggers this script
  enabled: boolean;
  priority: number; // Execution priority
  created: Date;
  updated: Date;
}

export interface AREXXContext {
  user?: any;
  session?: any;
  command?: string;
  parameters?: string[];
  variables: { [key: string]: any };
}

// QWK/FTN offline mail interfaces
export interface QWKPacket {
  id: string;
  filename: string;
  userId: string;
  status: 'creating' | 'ready' | 'sent' | 'error' | 'processing' | 'completed' | 'downloaded';
  messageCount: number;
  created: Date;
  sent?: Date;
  size: number;
  path?: string;
  fromBBS?: string;
  toBBS?: string;
  processedAt?: Date;
  messages?: any[];
  error?: string;
}

export interface QWKMessage {
  id: number;
  packetId: string;
  subject: string;
  body: string;
  author: string;
  recipient: string;
  timestamp: Date;
  conference: number;
  messageBase: number;
  isPrivate: boolean;
  status: 'unread' | 'read' | 'replied';
  from?: string; // QWK format field
  to?: string; // QWK format field
  date?: Date; // QWK format field
  isReply?: boolean; // QWK format field
  parentId?: number; // QWK format field
  attachments?: string[]; // QWK format field
}

export interface FTNMessage {
  id: number;
  subject: string;
  body: string;
  author: string;
  recipient: string;
  timestamp: Date;
  originAddress: string; // FTN address format (zone:net/node.point@domain)
  destinationAddress: string;
  conference: number;
  messageBase: number;
  isPrivate: boolean;
  status: 'unread' | 'read' | 'replied' | 'forwarded' | 'received' | 'sent' | 'archived';
  attributes: number; // FTN message attributes bitfield
  fromAddress?: string; // Additional FTN fields
  toAddress?: string;
  date?: Date;
  msgid?: string;
  replyTo?: string;
  area?: string;
}

// File transfer protocol interfaces
export interface TransferSession {
  id: string;
  userId: string;
  type: 'upload' | 'download';
  protocol: 'zmodem' | 'ftp' | 'websocket' | string;
  filename: string;
  size: number;
  transferred: number;
  status: 'starting' | 'active' | 'paused' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  speed: number; // bytes per second
  error?: string;
  checksum?: string;
  direction?: string;
  bytesTransferred?: number;
}