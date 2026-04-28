export interface NodeStatus {
  nodeId: number;
  online: boolean;
  userId?: string;
  username?: string;
  location?: string;
  state?: string;
  currentActivity?: string;
  connectionType?: string;
  lastActivity?: string;
  timeRemaining?: number;
}

export interface UserRecord {
  id?: string;
  username: string;
  realname?: string;
  location?: string;
  secLevel?: number;
  seclevel?: number;
  calls?: number;
  lastOn?: string;
  lastLogin?: string;
  uploads?: number;
  downloads?: number;
  flags?: number;
}

export interface ConferenceConfig {
  id: number;
  conference_id: number;
  name: string;
  ndirs: number;
  [key: string]: unknown;
}

export interface CallerRecord {
  id: number;
  nodeId: number;
  userId: string;
  username: string;
  action: string;
  details?: string;
  location: string;
  timestamp: string;
}

export interface SystemStats {
  allTime: {
    totalUsers: number;
    totalMessages: number;
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    totalCalls: number;
  };
  today: {
    calls: number;
    activeUsers: number;
  };
}

export interface LogResponse {
  lines: string[];
  totalLines: number;
  logFile?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; username: string; secLevel: number };
}
