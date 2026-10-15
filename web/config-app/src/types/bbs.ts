/**
 * Shapes served by the BBS API, declared once.
 *
 * Several pages currently declare private copies of these (ApiResponse alone
 * appears in a dozen files). New code imports from here; the copies go as each
 * page is converted.
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/** GET /api/nodes/status - read from the in-memory session map, not the database. */
export interface NodeStatus {
  nodeId: number;
  online: boolean;
  userId?: string;
  username?: string;
  location?: string;
  baud?: number;
  state?: string;
  currentActivity?: string;
  connectionType?: string;
  lastActivity?: string;
  timeRemaining?: number;
  /** Username this node is held for, or null when it is not reserved. */
  reservedFor: string | null;
}

export interface NodeStatusResponse extends ApiResponse<NodeStatus[]> {
  totalNodes: number;
  onlineNodes: number;
}

/** GET /api/stats/system */
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

export interface ActiveUser {
  sessionId: string;
  userId: string;
  username: string;
  location: string;
  currentConference: number;
  lastActivity: string;
  timeRemaining: number;
}

/** GET /api/stats/session */
export interface SessionStats {
  sessionStartTime: string;
  uptime: number;
  activeSessions: number;
  activeUsers: ActiveUser[];
}

/** GET /api/stats/last-callers */
export interface Caller {
  id: number;
  nodeId: number;
  userId: string;
  username: string;
  action: string;
  details: string;
  location: string;
  phone: string;
  timestamp: string;
}

/** GET /api/stats/last-uploads and /api/stats/last-downloads */
export interface FileActivity {
  id: number;
  filename: string;
  description: string;
  size: number;
  uploader: string;
  uploadDate: string;
  downloadCount: number;
  areaId: number;
  areaName: string;
}

export interface HealthIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  path?: string;
  autoFixable: boolean;
  fixAction?: string;
}

export interface HealthCheckResult {
  category: string;
  passed: boolean;
  issues: HealthIssue[];
  checkedCount: number;
  errorCount: number;
  warningCount: number;
}

/** GET /api/config/health - walks the filesystem, so it is never polled. */
export interface BBSHealthReport {
  timestamp: string;
  overallStatus: 'healthy' | 'warnings' | 'errors';
  totalIssues: number;
  autoFixableIssues: number;
  categories: HealthCheckResult[];
}
