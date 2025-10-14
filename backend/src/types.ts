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